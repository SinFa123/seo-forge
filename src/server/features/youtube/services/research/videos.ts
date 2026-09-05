import { z } from "zod";
import { unique } from "remeda";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  YOUTUBE_DATA_API_KEY_ENV,
  getChannelRecentUploads,
} from "@/server/lib/youtubeDataApiClient";
import {
  YOUTUBE_SCORING,
  computeChannelMultiplier,
  normalizeYoutubeKeyword,
} from "@/shared/youtube";
import type { ResolvedGetYoutubeVideosInput } from "@/types/schemas/youtube";
import { youtubeVideoRowSchema } from "@/types/schemas/youtube";
import type {
  YoutubeDataApiStatus,
  YoutubeVideosResult,
} from "@/types/youtube";
import {
  YOUTUBE_CACHE_NAMESPACE,
  YOUTUBE_CACHE_TTL,
  readCached,
} from "./cache";
import { YOUTUBE_FETCH_CONCURRENCY, mapWithConcurrency } from "./helpers";
import { buildVideoRow, getVideoInfo } from "./video-info";

// SEO Forge: Videos sub-tab orchestration. One YouTube SERP at the requested
// depth, video info per result (cached per video, shared with keyword
// research), and, when YOUTUBE_DATA_API_KEY is set, the channel's recent
// uploads for the channel-relative multiplier. The multiplier is null and
// `dataApiStatus` says why when the Data API is unavailable, so the UI can show
// a setup hint instead of a blank column.

const CACHE_VERSION = 1;

const cachedResultSchema = z.object({
  keyword: z.string(),
  rows: z.array(youtubeVideoRowSchema),
  dataApiStatus: z.enum(["ok", "not_configured", "error"]),
  fetchedAt: z.string(),
});

const cachedChannelStatsSchema = z.object({
  uploads: z.array(z.object({ videoId: z.string(), viewCount: z.number() })),
});
type ChannelStats = z.infer<typeof cachedChannelStatsSchema>;

type ChannelStatsResult =
  | { status: "ok"; stats: ChannelStats }
  | { status: "not_configured" | "error" };

async function getChannelStats(channelId: string): Promise<ChannelStatsResult> {
  const cacheKey = await buildCacheKey(YOUTUBE_CACHE_NAMESPACE.channelStats, {
    channelId,
  });
  const cached = await readCached(cacheKey, cachedChannelStatsSchema);
  if (cached) return { status: "ok", stats: cached };

  const result = await getChannelRecentUploads(channelId);
  if (result.status !== "ok") return { status: result.status };
  const stats: ChannelStats = {
    uploads: result.data.uploads.map(({ videoId, viewCount }) => ({
      videoId,
      viewCount,
    })),
  };
  await setCached(cacheKey, stats, YOUTUBE_CACHE_TTL.channelStats);
  return { status: "ok", stats };
}

function summarizeDataApiStatus(
  configured: boolean,
  results: ChannelStatsResult[],
): YoutubeDataApiStatus {
  if (!configured) return "not_configured";
  if (results.length > 0 && results.every((r) => r.status === "error")) {
    return "error";
  }
  return "ok";
}

export async function getVideos(
  input: ResolvedGetYoutubeVideosInput,
  billingCustomer: BillingCustomerContext,
): Promise<YoutubeVideosResult> {
  const keyword = normalizeYoutubeKeyword(input.keyword);
  if (keyword.length === 0) throw new AppError("VALIDATION_ERROR");

  const market = {
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  };
  const dataApiConfigured = Boolean(
    await getOptionalEnvValue(YOUTUBE_DATA_API_KEY_ENV),
  );
  // The key state is part of the cache key so configuring the Data API takes
  // effect on the next request instead of after the 6 hour TTL.
  const cacheKey = await buildCacheKey(YOUTUBE_CACHE_NAMESPACE.videos, {
    cacheVersion: CACHE_VERSION,
    estimatorVersion: YOUTUBE_SCORING.ESTIMATOR_VERSION,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword,
    ...market,
    depth: input.depth,
    dataApiConfigured,
  });
  const cached = await readCached(cacheKey, cachedResultSchema);
  if (cached) return cached;

  const client = createDataforseoClient(billingCustomer);
  const now = new Date();

  // DataForSEO can return more items than block_depth; video info is only
  // bought for the requested depth.
  const items = (
    await client.youtube.serp({ keyword, ...market, depth: input.depth })
  ).slice(0, input.depth);
  const infos = await mapWithConcurrency(
    items,
    YOUTUBE_FETCH_CONCURRENCY,
    (item) => getVideoInfo(client, { videoId: item.video_id ?? "", ...market }),
  );
  const rows = items.map((item, index) =>
    buildVideoRow(index + 1, item, infos[index]?.info ?? null, now),
  );

  const channelIds = dataApiConfigured
    ? unique(rows.flatMap((row) => (row.channelId ? [row.channelId] : [])))
    : [];
  const statsResults = await mapWithConcurrency(
    channelIds,
    YOUTUBE_FETCH_CONCURRENCY,
    getChannelStats,
  );
  const statsByChannel = new Map(
    channelIds.flatMap((channelId, index) => {
      const result = statsResults[index];
      return result?.status === "ok"
        ? [[channelId, result.stats] as const]
        : [];
    }),
  );

  const result: YoutubeVideosResult = {
    keyword,
    rows: rows.map((row) => {
      const stats = row.channelId ? statsByChannel.get(row.channelId) : null;
      if (!stats) return row;
      // The ranked video is excluded so it is compared against its siblings.
      const otherViews = stats.uploads
        .filter((upload) => upload.videoId !== row.videoId)
        .map((upload) => upload.viewCount);
      return {
        ...row,
        channelMultiplier: computeChannelMultiplier(row.viewsCount, otherViews),
      };
    }),
    dataApiStatus: summarizeDataApiStatus(dataApiConfigured, statsResults),
    fetchedAt: now.toISOString(),
  };

  await setCached(cacheKey, result, YOUTUBE_CACHE_TTL.videos);
  return result;
}
