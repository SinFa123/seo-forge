import { z } from "zod";
import { YoutubeResearchService } from "@/server/features/youtube/services/YoutubeResearchService";
import { assertLanguageForLocation } from "@/server/lib/market";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  languageCodeSchema,
  locationCodeSchema,
  projectIdSchema,
} from "@/server/mcp/schemas";
import { formatMcpTable } from "@/server/mcp/table";
import {
  CHANNEL_COLUMNS,
  KEYWORD_COLUMNS,
  VIDEO_COLUMNS,
} from "@/server/mcp/tools/youtube-tools-columns";
import { resolveMarket } from "@/shared/keyword-locations";
import type { YoutubeKeywordRow } from "@/shared/youtube";
import {
  YOUTUBE_SERP_ROW_LIMIT_DEFAULT,
  YOUTUBE_SERP_ROW_LIMIT_MAX,
  YOUTUBE_VIDEOS_DEPTH_DEFAULT,
  YOUTUBE_VIDEOS_DEPTH_MAX,
  youtubeKeywordRowSchema,
  youtubeSavedSortFields,
} from "@/types/schemas/youtube";

// SEO Forge: the four YouTube Research MCP tools. They call the same
// YoutubeResearchService as the UI's server functions and render text tables
// from the shared column definitions, so an agent sees exactly the numbers and
// columns a user sees in the tab (docs/seoforge/GOAL.md, "one service, three
// callers").

const VOLUME_CAVEAT =
  'YouTube publishes no search volume: `searchVolume` is an ESTIMATE (Google Ads volume mapped through a power law calibrated against VidIQ; Google Trends only sets the confidence of the seed) and every row carries `volumeConfidence` (high / medium / low; low means no Google anchor and is shown as "< 10"). Report volumes as estimates and mention the confidence.';

const seedSchema = z.object({
  seed: z.string().min(1).max(200).describe("Seed keyword to research."),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
});

const researchInputSchema = {
  projectId: projectIdSchema,
  seeds: z
    .array(seedSchema)
    .min(1)
    .max(5)
    .describe(
      "1-5 seed keywords. Each seed is researched independently (related, matching, and question keywords with estimated YouTube volume, competition, overall score, word count). Prefer one call with several seeds over several calls.",
    ),
  serpRowLimit: z
    .number()
    .int()
    .min(0)
    .max(YOUTUBE_SERP_ROW_LIMIT_MAX)
    .optional()
    .describe(
      `How many candidate keywords (ranked by Google volume) get their own YouTube SERP for a competition score. Defaults to ${YOUTUBE_SERP_ROW_LIMIT_DEFAULT}; 0 scores only the seed. Each row SERP costs about 0.002 USD; rows beyond the limit have competition null.`,
    ),
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Results are kept until refreshed; each result carries fetchedAt. Pass true to re-buy the research and overwrite the cached result. Ask the user first, since it charges the full cost again.",
    ),
  rowLimit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe(
      "Maximum keyword rows returned per seed, taken from the top of the volume-ranked list. Defaults to all (up to 200). Does not change what is researched or charged; use it to keep the response small.",
    ),
} as const;

type ResearchArgs = z.infer<z.ZodObject<typeof researchInputSchema>>;

export const researchYoutubeKeywordsTool = {
  name: "research_youtube_keywords",
  config: {
    title: "Research YouTube keywords (bulk)",
    description: `Research 1-5 seed keywords for YouTube: an overview of the seed (estimated monthly YouTube searches with confidence, competition 0-100 from the top 20 videos, overall opportunity 0-100, average views per hour of the top videos) plus up to 200 related, matching, and question keywords with the same metrics. Charges DataForSEO spend per seed: about 0.30 USD at the default serpRowLimit (one YouTube SERP, 20 video-info lookups, one Google Trends request, one Google Ads volume request, ${YOUTUBE_SERP_ROW_LIMIT_DEFAULT} row SERPs), plus 0.002 USD per extra row SERP; results are kept until refreshed (fetchedAt says when), so repeating a seed is free, and a call that fails at DataForSEO before returning results (for example HTTP 402 when the DataForSEO balance is exhausted) is not charged. ${VOLUME_CAVEAT} Returns per-seed results, so one bad seed does not fail the batch. Use get_youtube_videos for the ranking videos themselves.`,
    inputSchema: researchInputSchema,
    outputSchema: {
      results: z.array(
        z.union([
          z
            .object({
              seed: z.string(),
              ok: z.literal(true),
              rowCount: z.number(),
              totalRowCount: z.number(),
              overview: looseObjectOutputSchema,
              rows: z.array(looseObjectOutputSchema),
              diagnostics: looseObjectOutputSchema,
              fetchedAt: z.string(),
              notes: z.array(z.string()),
            })
            .passthrough(),
          z
            .object({
              seed: z.string(),
              ok: z.literal(false),
              error: z.string(),
            })
            .passthrough(),
        ]),
      ),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: ResearchArgs, context) => {
    const results = await Promise.all(
      args.seeds.map(async (item) => {
        try {
          const { locationCode, languageCode } = resolveMarket(
            item,
            context.project,
          );
          assertLanguageForLocation(locationCode, languageCode);
          const data = await YoutubeResearchService.research(
            {
              projectId: args.projectId,
              keyword: item.seed,
              locationCode,
              languageCode,
              serpRowLimit: args.serpRowLimit ?? YOUTUBE_SERP_ROW_LIMIT_DEFAULT,
              refresh: args.refresh ?? false,
            },
            context.billing,
          );
          const rows = args.rowLimit
            ? data.rows.slice(0, args.rowLimit)
            : data.rows;
          const scored = data.diagnostics.serpRowCount;
          return {
            seed: item.seed,
            ok: true as const,
            rowCount: rows.length,
            totalRowCount: data.rows.length,
            overview: data.seed,
            rows,
            diagnostics: data.diagnostics,
            fetchedAt: data.fetchedAt,
            // Payload-level caveats so a consumer that only inspects
            // structuredContent still sees them.
            notes: [
              "searchVolume is an estimated monthly YouTube search count (Google Ads volume mapped through a power law calibrated against VidIQ); report it as an estimate with volumeConfidence.",
              `competition was scored from a YouTube SERP for the seed and the top ${scored} rows by Google volume; competition null on other rows means unscored, not easy.`,
            ],
          };
        } catch (error) {
          return {
            seed: item.seed,
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    );

    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const text =
      results
        .map((r) => {
          if (!r.ok) return `## "${r.seed}" — FAILED\n${r.error}`;
          const overview = formatMcpTable([r.overview], KEYWORD_COLUMNS);
          const vph =
            r.overview.medianViewsPerHour == null
              ? "—"
              : r.overview.medianViewsPerHour.toFixed(1);
          const header = `## "${r.seed}" — ${r.rowCount}${r.totalRowCount > r.rowCount ? ` of ${r.totalRowCount}` : ""} keywords\nSeed overview (median avg views/hr of top ${r.overview.videoCount} videos: ${vph}):\n${overview}`;
          if (r.rowCount === 0) return `${header}\n(no candidate keywords)`;
          return `${header}\n\nKeywords:\n${formatMcpTable(r.rows, KEYWORD_COLUMNS)}`;
        })
        .join("\n\n") +
      `\n\nResearched ${okCount} of ${results.length} seeds${failCount > 0 ? ` (${failCount} failed)` : ""}. Columns: Search volume (est.) = estimated monthly YouTube searches ("< 10" = no anchor), Confidence = estimate confidence, Competition 0-100 (higher = harder; "—" = no SERP bought for the row), Overall 0-100 (higher = better opportunity), Words = word count, Type = seed / related / matching / question.`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/youtube`,
      ),
      structuredContent: { results },
    });
  }),
};

const videosInputSchema = {
  projectId: projectIdSchema,
  keyword: z
    .string()
    .min(1)
    .max(200)
    .describe("Keyword whose YouTube search results to inspect."),
  depth: z
    .number()
    .int()
    .min(YOUTUBE_VIDEOS_DEPTH_DEFAULT)
    .max(YOUTUBE_VIDEOS_DEPTH_MAX)
    .optional()
    .describe(
      `Number of ranking videos, ${YOUTUBE_VIDEOS_DEPTH_DEFAULT}-${YOUTUBE_VIDEOS_DEPTH_MAX}. Defaults to ${YOUTUBE_VIDEOS_DEPTH_DEFAULT}. Every video costs a 0.006 USD video-info lookup (cached 24 hours), so keep the default unless the user asks for more.`,
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
  refresh: z
    .boolean()
    .optional()
    .describe(
      "Results are kept until refreshed (see fetchedAt). Pass true to re-buy the SERP and overwrite the cached result.",
    ),
} as const;

type VideosArgs = z.infer<z.ZodObject<typeof videosInputSchema>>;

export const getYoutubeVideosTool = {
  name: "get_youtube_videos",
  config: {
    title: "Get top YouTube videos",
    description: `The videos currently ranking on YouTube for a keyword, plus the distinct channels behind them (subscribers, views across their ranking videos, breakout flag): title, channel, publish date, views, likes, comments, duration, Shorts flag, average views per hour since publish, subscriber count, and a channel multiplier (video views divided by the median of the channel's other recent uploads, e.g. 35x means an outlier for that channel). Charges about 0.002 USD per 20 results plus 0.006 USD per video for video info; the result is kept until refreshed (fetchedAt says when) and the keyword research seed's 20 videos are usually already cached. A call that fails at DataForSEO before returning results is not charged. The channel multiplier needs the optional YouTube Data API key on the server; when \`dataApiStatus\` is not "ok" the multiplier is null and the response says why. Use research_youtube_keywords for keyword metrics.`,
    inputSchema: videosInputSchema,
    outputSchema: {
      keyword: z.string(),
      rows: z.array(looseObjectOutputSchema),
      channels: z.array(looseObjectOutputSchema),
      dataApiStatus: z.enum(["ok", "not_configured", "error"]),
      fetchedAt: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: VideosArgs, context) => {
    const { locationCode, languageCode } = resolveMarket(args, context.project);
    assertLanguageForLocation(locationCode, languageCode);
    const data = await YoutubeResearchService.getVideos(
      {
        projectId: args.projectId,
        keyword: args.keyword,
        locationCode,
        languageCode,
        depth: args.depth ?? YOUTUBE_VIDEOS_DEPTH_DEFAULT,
        refresh: args.refresh ?? false,
      },
      context.billing,
    );

    const statusNote =
      data.dataApiStatus === "ok"
        ? ""
        : data.dataApiStatus === "not_configured"
          ? "\n\nChannel multiplier (vs channel) unavailable: YOUTUBE_DATA_API_KEY is not configured on this server."
          : "\n\nChannel multiplier (vs channel) unavailable: the YouTube Data API returned an error for every channel.";
    const text =
      data.rows.length === 0
        ? `No YouTube results for "${data.keyword}".`
        : `Top ${data.rows.length} YouTube videos for "${data.keyword}":\n${formatMcpTable(data.rows, VIDEO_COLUMNS)}\n\nChannels behind these videos (${data.channels.filter((c) => c.breakout).length} breakout):\n${formatMcpTable(data.channels, CHANNEL_COLUMNS)}\n\nAvg views/hr = lifetime average since publish (one snapshot, not a live rate); vs channel = views relative to the channel's median recent upload; Breakout = a channel of at most 500K subscribers whose ranking video did at least 10x the channel's median views (or, without the Data API, 3x its subscriber count in views).${statusNote}`;

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/youtube`,
        { q: data.keyword, tab: "videos" },
      ),
      structuredContent: {
        keyword: data.keyword,
        rows: data.rows,
        channels: data.channels,
        dataApiStatus: data.dataApiStatus,
        fetchedAt: data.fetchedAt,
      },
    });
  }),
};

const saveInputSchema = {
  projectId: projectIdSchema,
  rows: z
    .array(youtubeKeywordRowSchema)
    .min(1)
    .max(500)
    .describe(
      "Scored rows to save, copied verbatim from research_youtube_keywords (the overview row or any keyword row): keyword, kind, searchVolume, volumeConfidence, competition, overallScore, wordCount. Ask the user before saving; re-saving a keyword refreshes its stored metrics.",
    ),
  locationCode: locationCodeSchema.optional(),
  languageCode: languageCodeSchema.optional(),
} as const;

type SaveArgs = z.infer<z.ZodObject<typeof saveInputSchema>>;

export const saveYoutubeKeywordsTool = {
  name: "save_youtube_keywords",
  config: {
    title: "Save YouTube keywords",
    description:
      "Save scored YouTube keywords to the project's YouTube saved list (the Saved sub-tab of YouTube Research). Uses no credits and calls no provider. Idempotent per keyword and market: re-saving refreshes the stored estimate and scores. Separate from save_keywords, which is the Google keyword list.",
    inputSchema: saveInputSchema,
    outputSchema: {
      projectId: z.string(),
      savedCount: z.number(),
      keywords: z.array(z.string()),
      locationCode: z.number(),
      languageCode: z.string(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: SaveArgs, context) => {
    const { locationCode, languageCode } = resolveMarket(args, context.project);
    const rows: YoutubeKeywordRow[] = args.rows;
    const { saved } = await YoutubeResearchService.saveKeywords({
      projectId: args.projectId,
      rows,
      locationCode,
      languageCode,
    });
    const keywords = rows.map((row) => row.keyword);
    return mcpResponse({
      text: `Saved ${saved} YouTube keyword${saved === 1 ? "" : "s"} to the project: ${keywords.join(", ")}`,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/youtube`,
        { tab: "saved" },
      ),
      structuredContent: {
        projectId: args.projectId,
        savedCount: saved,
        keywords,
        locationCode,
        languageCode,
      },
    });
  }),
};

const listInputSchema = {
  projectId: projectIdSchema,
  limit: z
    .union([z.literal(50), z.literal(100), z.literal(250)])
    .optional()
    .describe("Maximum rows to return. Defaults to 100."),
  sort: z
    .enum(youtubeSavedSortFields)
    .optional()
    .describe("Sort field. Defaults to createdAt (newest first)."),
  order: z.enum(["asc", "desc"]).optional().describe("Defaults to desc."),
} as const;

type ListArgs = z.infer<z.ZodObject<typeof listInputSchema>>;

export const listSavedYoutubeKeywordsTool = {
  name: "list_saved_youtube_keywords",
  config: {
    title: "List saved YouTube keywords",
    description: `Lists the YouTube keywords saved to a project with their stored estimated volume, confidence, competition, overall score, and when the metrics were computed. Uses no credits (reads the database). ${VOLUME_CAVEAT}`,
    inputSchema: listInputSchema,
    outputSchema: {
      rows: z.array(looseObjectOutputSchema),
      totalCount: z.number(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: ListArgs, context) => {
    const { rows, total } = await YoutubeResearchService.getSavedKeywords({
      projectId: args.projectId,
      page: 1,
      pageSize: args.limit ?? 100,
      sort: args.sort ?? "createdAt",
      order: args.order ?? "desc",
    });
    const text =
      rows.length === 0
        ? "No saved YouTube keywords yet."
        : `Saved YouTube keywords (${rows.length} of ${total}):\n${formatMcpTable(rows, KEYWORD_COLUMNS)}`;
    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/youtube`,
        { tab: "saved" },
      ),
      structuredContent: { rows, totalCount: total },
    });
  }),
};
