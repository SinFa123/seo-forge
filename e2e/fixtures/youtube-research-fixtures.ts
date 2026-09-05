import type { YoutubeKeywordRow, YoutubeVideoRow } from "@/shared/youtube";
import type {
  ResolvedGetYoutubeVideosInput,
  ResolvedResearchYoutubeKeywordsInput,
} from "@/types/schemas/youtube";
import type {
  YoutubeResearchResult,
  YoutubeVideosResult,
} from "@/types/youtube";

// SEO Forge: deterministic YouTube research data for Playwright, served by the
// server functions when VITE_E2E_YOUTUBE_FIXTURES=1 (no DataForSEO calls).

function makeRow(
  keyword: string,
  index: number,
  overrides: Partial<YoutubeKeywordRow> = {},
): YoutubeKeywordRow {
  return {
    keyword,
    kind:
      index % 3 === 0 ? "question" : index % 2 === 0 ? "related" : "matching",
    searchVolume: 60_000 - index * 4_500,
    volumeConfidence: "medium",
    competition: 40 + (index % 5) * 8,
    overallScore: 70 - index * 3,
    wordCount: keyword.split(" ").length,
    ...overrides,
  };
}

export function getYoutubeResearchFixture(
  data: ResolvedResearchYoutubeKeywordsInput,
): YoutubeResearchResult {
  const seed = data.keyword.trim().toLowerCase();
  const rows = [
    makeRow(`${seed} recipe`, 1),
    makeRow(`${seed} for beginners`, 2),
    makeRow(`how to make ${seed}`, 3),
    makeRow(`${seed} tips`, 4),
    makeRow(`${seed} at home`, 5),
    makeRow(`why is ${seed} popular`, 6),
    makeRow(`${seed} tutorial`, 7),
    makeRow(`${seed} mistakes`, 8, {
      searchVolume: null,
      volumeConfidence: "low",
      competition: null,
      overallScore: null,
    }),
  ];
  const scoredRows = Math.min(data.serpRowLimit, rows.length);
  return {
    seed: {
      keyword: seed,
      kind: "seed",
      searchVolume: 78_916,
      volumeConfidence: "high",
      competition: 66,
      overallScore: 53,
      wordCount: seed.split(" ").length,
      medianViewsPerHour: 40.5,
      videoCount: 20,
    },
    rows: rows.map((row, index) =>
      index < scoredRows ? row : { ...row, competition: null },
    ),
    diagnostics: {
      candidateCount: rows.length,
      suggestionCount: 120,
      trendsRelatedCount: 12,
      anchoredCount: rows.length - 1,
      serpRowCount: scoredRows,
      seedInterest: 10.9,
      benchmarkInterest: 41.5,
      seedYoutubeShare: 0.39,
      apiCalls: {
        youtubeSerp: 1 + scoredRows,
        videoInfo: 20,
        trends: 2,
        adsSearchVolume: 1,
        suggest: 36,
      },
    },
    fetchedAt: "2026-09-05T12:00:00.000Z",
  };
}

function makeVideo(index: number, keyword: string): YoutubeVideoRow {
  const rank = index + 1;
  return {
    rank,
    videoId: `fixture-${rank}`,
    title: `${keyword} video ${rank}`,
    url: `https://www.youtube.com/watch?v=fixture-${rank}`,
    thumbnailUrl: null,
    channelId: `channel-${rank % 4}`,
    channelName: `Channel ${rank % 4}`,
    channelUrl: null,
    publishedAt: "2025-07-21T12:01:32.000Z",
    publishedLabel: `${rank} months ago`,
    viewsCount: 1_000_000 - index * 60_000,
    likesCount: 9_000 - index * 400,
    commentsCount: 300 - index * 10,
    durationSeconds: 600 + index * 30,
    isShorts: rank % 5 === 0,
    isLive: false,
    viewsPerHour: 95 - index * 4,
    subscribersCount: 250_000 - index * 10_000,
    channelMultiplier: null,
  };
}

export function getYoutubeVideosFixture(
  data: ResolvedGetYoutubeVideosInput,
): YoutubeVideosResult {
  const keyword = data.keyword.trim().toLowerCase();
  return {
    keyword,
    rows: Array.from({ length: 12 }, (_, index) => makeVideo(index, keyword)),
    dataApiStatus: "not_configured",
    fetchedAt: "2026-09-05T12:00:00.000Z",
  };
}
