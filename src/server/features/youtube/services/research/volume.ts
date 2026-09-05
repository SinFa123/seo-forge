import type { createDataforseoClient } from "@/server/lib/dataforseo";
import type { GoogleTrendsExploreResult } from "@/server/lib/dataforseo/google-trends";
import {
  YOUTUBE_SCORING,
  computeSeedYoutubeShare,
  normalizeYoutubeKeyword,
} from "@/shared/youtube";

// SEO Forge: inputs to the YouTube search volume estimate (PLAN.md section 5).
// YouTube publishes no volume, so every row is anchored on Google Ads monthly
// volume and the seed is scaled by its Google Trends (type=youtube) interest
// relative to a benchmark keyword sent in the same request. Trends is only
// ever queried for the seed: candidates inherit a dampened share (see
// estimateSearchVolume in src/shared/youtube.ts). The formulas themselves are
// pure and live in the shared module; this file owns the two metered calls.

export type DataforseoClient = ReturnType<typeof createDataforseoClient>;

// Only the sections each fetcher touches, so tests can pass a partial client
// without a type assertion.
type AdsVolumeClient = {
  keywords: Pick<DataforseoClient["keywords"], "adsSearchVolume">;
};
type TrendsClient = { trends: Pick<DataforseoClient["trends"], "explore"> };

type Market = { locationCode: number; languageCode: string };

/** Weekly Trends points averaged for a keyword's interest. */
const TRENDS_INTEREST_WEEKS = 12;

/**
 * One bulk Google Ads search_volume call for the seed and every candidate.
 * Keys are normalised keywords; a keyword Google Ads knows nothing about maps
 * to null (and later to a "low" confidence row with no volume).
 */
export async function fetchVolumeAnchors(
  client: AdsVolumeClient,
  input: Market & { keywords: string[] },
): Promise<Map<string, number | null>> {
  const anchors = new Map<string, number | null>(
    input.keywords.map((keyword) => [normalizeYoutubeKeyword(keyword), null]),
  );
  if (anchors.size === 0) return anchors;

  const items = await client.keywords.adsSearchVolume({
    keywords: [...anchors.keys()],
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });
  for (const item of items) {
    if (!item.keyword) continue;
    const keyword = normalizeYoutubeKeyword(item.keyword);
    if (!anchors.has(keyword)) continue;
    anchors.set(keyword, item.search_volume ?? null);
  }
  return anchors;
}

/**
 * Mean of the last `weeks` weekly values for `keyword` in a Trends graph, or
 * null when the keyword is absent or every point is missing. Trends reports 0
 * for "not enough data", which the share formula treats as no signal.
 */
export function meanRecentInterest(
  graph: GoogleTrendsExploreResult["graph"],
  keyword: string,
  weeks = TRENDS_INTEREST_WEEKS,
): number | null {
  if (!graph) return null;
  const target = normalizeYoutubeKeyword(keyword);
  const index = graph.keywords.findIndex(
    (candidate) => normalizeYoutubeKeyword(candidate) === target,
  );
  if (index === -1) return null;
  const values = graph.points.slice(-weeks).flatMap((point) => {
    const value = point.values[index];
    return value == null ? [] : [value];
  });
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

type SeedTrendsInterest = {
  seedInterest: number | null;
  benchmarkInterest: number | null;
};

/**
 * One Trends explore request (`type: youtube`) carrying the seed and the
 * benchmark keyword so their relative interest is comparable. When the seed
 * is the benchmark itself the request carries one keyword. Runs alongside the
 * seed SERP; the share is derived once the Google anchor is known.
 */
export async function fetchSeedTrendsInterest(
  client: TrendsClient,
  input: Market & { seed: string },
): Promise<SeedTrendsInterest> {
  const seed = normalizeYoutubeKeyword(input.seed);
  const benchmark = normalizeYoutubeKeyword(YOUTUBE_SCORING.BENCHMARK.keyword);
  const keywords = seed === benchmark ? [seed] : [seed, benchmark];

  const { graph } = await client.trends.explore({
    keywords,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    type: "youtube",
    itemTypes: ["google_trends_graph"],
  });
  return {
    seedInterest: meanRecentInterest(graph, seed),
    benchmarkInterest: meanRecentInterest(graph, benchmark),
  };
}

/** Seed YouTube share from its Trends interest and Google anchor; see shared. */
export function deriveSeedYoutubeShare(
  interest: SeedTrendsInterest,
  anchorVolume: number | null,
): number | null {
  return computeSeedYoutubeShare({ ...interest, anchorVolume });
}
