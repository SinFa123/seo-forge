import type { createDataforseoClient } from "@/server/lib/dataforseo";
import type { GoogleTrendsExploreResult } from "@/server/lib/dataforseo/google-trends";
import { normalizeYoutubeKeyword } from "@/shared/youtube";

// SEO Forge: inputs to the YouTube search volume estimate (PLAN.md section 5).
// YouTube publishes no volume, so every row is anchored on Google Ads monthly
// volume and mapped through the calibrated power law in src/shared/youtube.ts.
// Google Trends (type=youtube) is queried once for the seed; its interest
// series only decides the seed's confidence and supplies related queries.

export type DataforseoClient = ReturnType<typeof createDataforseoClient>;

// Only the sections each fetcher touches, so tests can pass a partial client
// without a type assertion.
type AdsVolumeClient = {
  keywords: Pick<DataforseoClient["keywords"], "adsSearchVolume">;
};

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
