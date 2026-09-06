import { z } from "zod";
import { sortBy } from "remeda";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import {
  YOUTUBE_SCORING,
  type YoutubeKeywordRow,
  type YoutubeResearchOverview,
  computeCompetition,
  computeOverallScore,
  countWords,
  estimateSearchVolume,
  hasTrendsSignal,
  median,
  normalizeYoutubeKeyword,
} from "@/shared/youtube";
import type { ResolvedResearchYoutubeKeywordsInput } from "@/types/schemas/youtube";
import { youtubeKeywordRowSchema } from "@/types/schemas/youtube";
import type {
  YoutubeResearchApiCalls,
  YoutubeResearchResult,
} from "@/types/youtube";
import {
  YOUTUBE_CACHE_NAMESPACE,
  YOUTUBE_CACHE_TTL,
  readCached,
} from "./cache";
import { fetchSuggestionLists, generateCandidates } from "./candidates";
import { YOUTUBE_FETCH_CONCURRENCY, mapWithConcurrency } from "./helpers";
import { buildVideoRow, getVideoInfo, toCompetitionInput } from "./video-info";
import {
  type DataforseoClient,
  fetchVolumeAnchors,
  meanRecentInterest,
} from "./volume";

// SEO Forge: keyword research orchestration for one seed. External calls per
// run (PLAN.md section 4): seed SERP (1), seed video info (<= 20, cached per
// video), suggest (~36, free), Trends (1: seed graph for confidence plus
// related queries), Google Ads volume (1 bulk), and one SERP per candidate row
// up to `serpRowLimit`. The whole result is cached 24 hours; the key carries the
// estimator version so a formula change recomputes rather than serves stale
// scores.

// Bump when the cached result shape changes (formula changes bump
// YOUTUBE_SCORING.ESTIMATOR_VERSION instead).
const CACHE_VERSION = 1;

/** Results the seed SERP fetches; video info is bought for each of them. */
const SEED_SERP_DEPTH = 20;
const ROW_SERP_DEPTH = 20;

const cachedResultSchema = z.object({
  seed: youtubeKeywordRowSchema.extend({
    medianViewsPerHour: z.number().nullable(),
    videoCount: z.number().int().nonnegative(),
  }),
  rows: z.array(youtubeKeywordRowSchema),
  diagnostics: z.object({
    candidateCount: z.number().int(),
    suggestionCount: z.number().int(),
    trendsRelatedCount: z.number().int(),
    anchoredCount: z.number().int(),
    serpRowCount: z.number().int(),
    seedInterest: z.number().nullable(),
    apiCalls: z.object({
      youtubeSerp: z.number().int(),
      videoInfo: z.number().int(),
      trends: z.number().int(),
      adsSearchVolume: z.number().int(),
      suggest: z.number().int(),
    }),
  }),
  fetchedAt: z.string(),
});

type Market = { locationCode: number; languageCode: string };

async function fetchSeedVideoRows(
  client: DataforseoClient,
  seed: string,
  market: Market,
  now: Date,
  calls: YoutubeResearchApiCalls,
) {
  // DataForSEO can return more items than block_depth; only the requested
  // page gets video info bought for it.
  const items = (
    await client.youtube.serp({
      keyword: seed,
      ...market,
      depth: SEED_SERP_DEPTH,
    })
  ).slice(0, SEED_SERP_DEPTH);
  calls.youtubeSerp += 1;

  const infos = await mapWithConcurrency(
    items,
    YOUTUBE_FETCH_CONCURRENCY,
    (item) => getVideoInfo(client, { videoId: item.video_id ?? "", ...market }),
  );
  calls.videoInfo += infos.filter((result) => result.fetched).length;

  return items.map((item, index) =>
    buildVideoRow(index + 1, item, infos[index]?.info ?? null, now),
  );
}

async function fetchRowCompetition(
  client: DataforseoClient,
  keywords: string[],
  market: Market,
  now: Date,
  calls: YoutubeResearchApiCalls,
): Promise<Map<string, number | null>> {
  const entries = await mapWithConcurrency(
    keywords,
    YOUTUBE_FETCH_CONCURRENCY,
    async (keyword) => {
      const items = await client.youtube.serp({
        keyword,
        ...market,
        depth: ROW_SERP_DEPTH,
      });
      const videos = items.map((item, index) =>
        toCompetitionInput(buildVideoRow(index + 1, item, null, now), now),
      );
      return [keyword, computeCompetition(videos, now)] as const;
    },
  );
  calls.youtubeSerp += keywords.length;
  return new Map(entries);
}

export async function research(
  input: ResolvedResearchYoutubeKeywordsInput,
  billingCustomer: BillingCustomerContext,
): Promise<YoutubeResearchResult> {
  const seed = normalizeYoutubeKeyword(input.keyword);
  if (seed.length === 0) throw new AppError("VALIDATION_ERROR");

  const market: Market = {
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  };
  const cacheKey = await buildCacheKey(YOUTUBE_CACHE_NAMESPACE.research, {
    cacheVersion: CACHE_VERSION,
    estimatorVersion: YOUTUBE_SCORING.ESTIMATOR_VERSION,
    organizationId: billingCustomer.organizationId,
    projectId: input.projectId,
    keyword: seed,
    ...market,
    serpRowLimit: input.serpRowLimit,
  });
  const cached = await readCached(cacheKey, cachedResultSchema);
  if (cached) return cached;

  const client = createDataforseoClient(billingCustomer);
  const now = new Date();
  const calls: YoutubeResearchApiCalls = {
    youtubeSerp: 0,
    videoInfo: 0,
    trends: 0,
    adsSearchVolume: 0,
    suggest: 0,
  };

  // One single-keyword Trends request returns both the seed's interest graph
  // (confidence signal) and its related queries (candidates). The free suggest
  // fan-out does not depend on any of it, so all three run together.
  const [seedVideos, seedTrends, suggestions] = await Promise.all([
    fetchSeedVideoRows(client, seed, market, now, calls),
    client.trends.explore({ keywords: [seed], ...market, type: "youtube" }),
    fetchSuggestionLists({ seed, ...market }),
  ]);
  calls.trends += 1;
  const seedInterest = meanRecentInterest(seedTrends.graph, seed);
  const trendsSignal = hasTrendsSignal(seedInterest);
  const trendsRelated = {
    top: (seedTrends.queries?.top ?? []).map((entry) => entry.query),
    rising: (seedTrends.queries?.rising ?? []).map((entry) => entry.query),
  };

  const candidateResult = await generateCandidates({
    seed,
    ...market,
    trendsRelated,
    suggestions,
  });
  calls.suggest += candidateResult.suggestCalls;
  const candidates = candidateResult.candidates;

  const anchors = await fetchVolumeAnchors(client, {
    ...market,
    keywords: [seed, ...candidates.map((candidate) => candidate.keyword)],
  });
  calls.adsSearchVolume += 1;
  const seedAnchor = anchors.get(seed) ?? null;

  // Rows are ranked by Google anchor so the paid per-row SERPs go to the
  // candidates most likely to matter; unknown volumes sort last.
  const ranked = sortBy(candidates, [
    (candidate) => anchors.get(candidate.keyword) ?? -1,
    "desc",
  ]);
  const serpKeywords = ranked
    .slice(0, input.serpRowLimit)
    .map((candidate) => candidate.keyword);

  const competitionByKeyword = await fetchRowCompetition(
    client,
    serpKeywords,
    market,
    now,
    calls,
  );

  const seedVolume = estimateSearchVolume({
    anchorVolume: seedAnchor,
    trendsSignal,
  });
  const seedCompetition = computeCompetition(
    seedVideos.map((video) => toCompetitionInput(video, now)),
    now,
  );
  const seedRow: YoutubeResearchOverview = {
    keyword: seed,
    kind: "seed",
    ...seedVolume,
    competition: seedCompetition,
    overallScore: computeOverallScore(seedVolume.searchVolume, seedCompetition),
    wordCount: countWords(seed),
    medianViewsPerHour: median(
      seedVideos.flatMap((video) =>
        video.viewsPerHour == null ? [] : [video.viewsPerHour],
      ),
    ),
    videoCount: seedVideos.length,
  };

  const rows: YoutubeKeywordRow[] = ranked.map((candidate) => {
    const volume = estimateSearchVolume({
      anchorVolume: anchors.get(candidate.keyword) ?? null,
      trendsSignal: false,
    });
    const competition = competitionByKeyword.get(candidate.keyword) ?? null;
    return {
      keyword: candidate.keyword,
      kind: candidate.kind,
      ...volume,
      competition,
      overallScore: computeOverallScore(volume.searchVolume, competition),
      wordCount: countWords(candidate.keyword),
    };
  });

  const result: YoutubeResearchResult = {
    seed: seedRow,
    rows,
    diagnostics: {
      candidateCount: candidates.length,
      suggestionCount: candidateResult.suggestionCount,
      trendsRelatedCount:
        trendsRelated.top.length + trendsRelated.rising.length,
      anchoredCount: [...anchors.values()].filter((value) => value != null)
        .length,
      serpRowCount: serpKeywords.length,
      seedInterest,
      apiCalls: calls,
    },
    fetchedAt: now.toISOString(),
  };

  await setCached(cacheKey, result, YOUTUBE_CACHE_TTL.research);
  return result;
}
