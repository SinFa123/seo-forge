import { describe, expect, it } from "vitest";
import {
  type CalibrationSample,
  fitYoutubeScoring,
  spearmanCorrelation,
} from "./youtube-calibration";

const BENCH = "how to tie a tie";

function sample(
  keyword: string,
  vidiqVolume: number,
  anchorVolume: number | null,
  interest: number | null,
): CalibrationSample {
  return {
    keyword,
    vidiqVolume,
    anchorVolume,
    interest,
    benchmarkInterest: 50,
  };
}

describe("fitYoutubeScoring", () => {
  it("fits the default share and bounds from implied shares and takes the benchmark volume from the sample", () => {
    const fit = fitYoutubeScoring(
      [
        sample(BENCH, 300_000, 1_000_000, 50),
        sample("bake bread", 20_000, 100_000, 10),
        sample("sourdough", 40_000, 100_000, null),
        sample("obscure", 500, null, null),
      ],
      BENCH,
    );

    expect(fit.benchmark).toEqual({
      keyword: BENCH,
      youtubeMonthlyVolume: 300_000,
    });
    // implied shares: 0.3, 0.2, 0.4 => median 0.3, 5th/95th percentiles 0.21/0.39
    expect(fit.defaultYoutubeShare).toBe(0.3);
    expect(fit.youtubeShareBounds).toEqual({ min: 0.21, max: 0.39 });
    // bake bread: (10/50) * 300k / 100k = 0.6, clamped to 0.39 => 39,000
    expect(fit.rows[1]).toMatchObject({ estimate: 39_000, ratio: 1.95 });
    // no Trends signal => default share
    expect(fit.rows[2]).toMatchObject({ estimate: 30_000, ratio: 0.75 });
    // no anchor => no estimate
    expect(fit.rows[3]).toMatchObject({ estimate: null, ratio: null });
    expect(fit.stats).toMatchObject({
      sampleCount: 4,
      anchoredCount: 3,
      withTrendsCount: 2,
    });
    expect(fit.stats.medianRatio).toBe(1);
  });
});

describe("spearmanCorrelation", () => {
  it("is 1 for a monotone relation, -1 when reversed, and null for too few points", () => {
    expect(spearmanCorrelation([1, 5, 20, 100], [10, 20, 30, 40])).toBe(1);
    expect(spearmanCorrelation([1, 5, 20, 100], [40, 30, 20, 10])).toBe(-1);
    expect(spearmanCorrelation([1, 2], [1, 2])).toBeNull();
  });
});
