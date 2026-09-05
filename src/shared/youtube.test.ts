import { describe, expect, it } from "vitest";
import {
  YOUTUBE_KEYWORD_COLUMNS,
  YOUTUBE_VIDEO_COLUMNS,
  formatChannelMultiplier,
  formatDuration,
} from "@/shared/youtube-columns";
import {
  YOUTUBE_SCORING,
  classifyKeywordKind,
  computeChannelMultiplier,
  computeCompetition,
  computeOverallScore,
  computeSeedYoutubeShare,
  computeViewsPerHour,
  countWords,
  estimateSearchVolume,
  median,
  normalizeYoutubeKeyword,
  parseRelativePublicationDate,
  type YoutubeKeywordRow,
} from "@/shared/youtube";

const NOW = new Date("2026-09-05T12:00:00.000Z");

describe("keyword helpers", () => {
  it("normalizes case and whitespace and counts words", () => {
    expect(normalizeYoutubeKeyword("  How to   Bake BREAD ")).toBe(
      "how to bake bread",
    );
    expect(countWords("  How to   Bake BREAD ")).toBe(4);
    expect(countWords("   ")).toBe(0);
  });

  it("classifies questions before matching terms, then matching, then related", () => {
    expect(classifyKeywordKind("how to bake bread", "bake bread")).toBe(
      "question",
    );
    expect(classifyKeywordKind("best bread to bake?", "bake bread")).toBe(
      "question",
    );
    expect(
      classifyKeywordKind("bake sourdough bread at home", "bake bread"),
    ).toBe("matching");
    expect(classifyKeywordKind("sourdough starter", "bake bread")).toBe(
      "related",
    );
  });
});

describe("video metrics", () => {
  it("computes lifetime average views per hour and floors the age at one hour", () => {
    const tenDaysAgo = new Date(
      NOW.getTime() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(computeViewsPerHour(24_000, tenDaysAgo, NOW)).toBe(100);
    expect(computeViewsPerHour(500, NOW.toISOString(), NOW)).toBe(500);
    expect(computeViewsPerHour(null, tenDaysAgo, NOW)).toBeNull();
    expect(computeViewsPerHour(10, "not a date", NOW)).toBeNull();
  });

  it("parses YouTube's relative publication labels approximately", () => {
    expect(parseRelativePublicationDate("3 days ago", NOW)).toBe(
      "2026-09-02T12:00:00.000Z",
    );
    expect(parseRelativePublicationDate("Streamed 2 weeks ago", NOW)).toBe(
      "2026-08-22T12:00:00.000Z",
    );
    expect(parseRelativePublicationDate("1 year ago", NOW)).toBe(
      "2025-09-05T12:00:00.000Z",
    );
    expect(parseRelativePublicationDate("Premieres tomorrow", NOW)).toBeNull();
    expect(parseRelativePublicationDate(null, NOW)).toBeNull();
  });

  it("takes the median for odd and even sample sizes", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it("computes the channel multiplier only with enough other uploads", () => {
    const others = [1000, 1200, 900, 1100, 1000];
    expect(computeChannelMultiplier(35_000, others)).toBe(35);
    expect(computeChannelMultiplier(35_000, others.slice(0, 4))).toBeNull();
    expect(computeChannelMultiplier(null, others)).toBeNull();
    expect(computeChannelMultiplier(10, [0, 0, 0, 0, 0])).toBeNull();
  });
});

describe("competition", () => {
  const fresh = new Date(
    NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const old = new Date(
    NOW.getTime() - 3 * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  it("is null without any view counts", () => {
    expect(computeCompetition([], NOW)).toBeNull();
    expect(
      computeCompetition(
        [
          {
            viewsCount: null,
            subscribersCount: null,
            publishedAt: null,
            isShorts: false,
            channelId: "a",
          },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("scores entrenched, high-view, single-channel results as harder than fresh small ones", () => {
    const entrenched = computeCompetition(
      Array.from({ length: 5 }, () => ({
        viewsCount: 5_000_000,
        subscribersCount: 8_000_000,
        publishedAt: old,
        isShorts: false,
        channelId: "same-channel",
      })),
      NOW,
    );
    const contestable = computeCompetition(
      Array.from({ length: 5 }, (_, i) => ({
        viewsCount: 2_000,
        subscribersCount: 1_500,
        publishedAt: fresh,
        isShorts: true,
        channelId: `channel-${i}`,
      })),
      NOW,
    );
    expect(entrenched).toBeGreaterThan(80);
    expect(contestable).toBeLessThan(20);
  });

  it("folds the subscriber weight into views when no subscriber data exists", () => {
    // Ten old, high-view videos from one channel saturate views, subscribers,
    // freshness and (nearly) domination; with and without subscriber data the
    // fold must land on the same score.
    const videos = Array.from({ length: 10 }, () => ({
      viewsCount: 10_000_000,
      publishedAt: old,
      isShorts: false,
      channelId: "same-channel",
    }));
    const withSubs = computeCompetition(
      videos.map((v) => ({ ...v, subscribersCount: 10_000_000 })),
      NOW,
    );
    const withoutSubs = computeCompetition(
      videos.map((v) => ({ ...v, subscribersCount: null })),
      NOW,
    );
    expect(withSubs).toBeGreaterThanOrEqual(95);
    expect(withoutSubs).toBe(withSubs);
  });
});

describe("search volume estimate", () => {
  it("derives the seed share from Trends relative to the benchmark, clamped", () => {
    const { benchmark, bounds } = {
      benchmark: YOUTUBE_SCORING.BENCHMARK.youtubeMonthlyVolume,
      bounds: YOUTUBE_SCORING.YOUTUBE_SHARE_BOUNDS,
    };
    // seed interest half the benchmark => half the benchmark's YouTube volume.
    expect(
      computeSeedYoutubeShare({
        seedInterest: 50,
        benchmarkInterest: 100,
        anchorVolume: benchmark,
      }),
    ).toBeCloseTo(0.5);
    expect(
      computeSeedYoutubeShare({
        seedInterest: 100,
        benchmarkInterest: 1,
        anchorVolume: 10,
      }),
    ).toBe(bounds.max);
    expect(
      computeSeedYoutubeShare({
        seedInterest: 0,
        benchmarkInterest: 100,
        anchorVolume: 1000,
      }),
    ).toBeNull();
    expect(
      computeSeedYoutubeShare({
        seedInterest: 50,
        benchmarkInterest: 100,
        anchorVolume: null,
      }),
    ).toBeNull();
  });

  it("assigns confidence by which inputs exist", () => {
    expect(
      estimateSearchVolume({ anchorVolume: null, seedShare: 1, isSeed: true }),
    ).toEqual({ searchVolume: null, volumeConfidence: "low" });
    expect(
      estimateSearchVolume({
        anchorVolume: 1000,
        seedShare: null,
        isSeed: true,
      }),
    ).toEqual({
      searchVolume: Math.round(1000 * YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE),
      volumeConfidence: "medium",
    });
    expect(
      estimateSearchVolume({
        anchorVolume: 1000,
        seedShare: 0.9,
        isSeed: true,
      }),
    ).toEqual({ searchVolume: 900, volumeConfidence: "high" });
  });

  it("dampens a candidate's share halfway between the default and the seed's", () => {
    const base = YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE;
    const result = estimateSearchVolume({
      anchorVolume: 1000,
      seedShare: 0.9,
      isSeed: false,
    });
    expect(result.volumeConfidence).toBe("medium");
    expect(result.searchVolume).toBe(
      Math.round(1000 * (base + (0.9 - base) * 0.5)),
    );
  });
});

describe("overall score", () => {
  it("rewards volume and ease, treats unknown competition as middling, and is null without volume", () => {
    expect(computeOverallScore(null, 10)).toBeNull();
    const easyBig = computeOverallScore(500_000, 10);
    const hardBig = computeOverallScore(500_000, 90);
    const easySmall = computeOverallScore(50, 10);
    expect(easyBig).toBeGreaterThan(hardBig ?? 0);
    expect(easyBig).toBeGreaterThan(easySmall ?? 0);
    expect(computeOverallScore(1000, null)).toBe(computeOverallScore(1000, 50));
    expect(
      computeOverallScore(YOUTUBE_SCORING.OVERALL_VOLUME_UPPER_BOUND, 0),
    ).toBe(100);
  });
});

describe("column definitions and formatters", () => {
  it("keeps the keyword table columns in the agreed order", () => {
    expect(YOUTUBE_KEYWORD_COLUMNS.map((column) => column.key)).toEqual([
      "keyword",
      "searchVolume",
      "volumeConfidence",
      "competition",
      "overallScore",
      "wordCount",
      "kind",
    ]);
    expect(YOUTUBE_VIDEO_COLUMNS.map((column) => column.key)).toContain(
      "viewsPerHour",
    );
  });

  it("formats null volume as '< 10' and other cells consistently", () => {
    const row: YoutubeKeywordRow = {
      keyword: "bake bread",
      kind: "seed",
      searchVolume: null,
      volumeConfidence: "low",
      competition: 42,
      overallScore: null,
      wordCount: 2,
    };
    const byKey = Object.fromEntries(
      YOUTUBE_KEYWORD_COLUMNS.map((column) => [column.key, column.format(row)]),
    );
    expect(byKey).toEqual({
      keyword: "bake bread",
      searchVolume: "< 10",
      volumeConfidence: "low",
      competition: "42",
      overallScore: "—",
      wordCount: "2",
      kind: "seed",
    });
    expect(formatChannelMultiplier(35.4)).toBe("35x");
    expect(formatChannelMultiplier(2.36)).toBe("2.4x");
    expect(formatDuration(1376)).toBe("22:56");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
});
