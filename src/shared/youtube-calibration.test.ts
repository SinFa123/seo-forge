import { describe, expect, it } from "vitest";
import {
  type CalibrationSample,
  fitYoutubeScoring,
  spearmanCorrelation,
} from "./youtube-calibration";

function sample(
  keyword: string,
  vidiqVolume: number,
  anchorVolume: number | null,
  extra: Partial<CalibrationSample> = {},
): CalibrationSample {
  return { keyword, vidiqVolume, anchorVolume, ...extra };
}

describe("fitYoutubeScoring", () => {
  it("recovers an exact power law, skips bounded and unanchored rows, and reports fit quality", () => {
    // vidiq = 100 * anchor^0.5 exactly
    const fit = fitYoutubeScoring([
      sample("a", 1_000, 100),
      sample("b", 10_000, 10_000),
      sample("c", 100_000, 1_000_000),
      sample("bounded", 750, 25, { vidiqIsUpperBound: true }),
      sample("no anchor", 500, null),
    ]);

    expect(fit.powerLaw).toEqual({ coefficient: 100, exponent: 0.5 });
    expect(fit.stats).toMatchObject({
      sampleCount: 5,
      anchoredCount: 4,
      fittedCount: 3,
      spearman: 1,
      within3x: 1,
      within10x: 1,
    });
    // The bounded row is still estimated against its upper bound.
    expect(fit.rows[3]).toMatchObject({ estimate: 500, ratio: 500 / 750 });
    expect(fit.rows[4]).toMatchObject({ estimate: null, ratio: null });
  });

  it("correlates our competition and overall scores with VidIQ's when both sides exist", () => {
    const fit = fitYoutubeScoring([
      sample("a", 1000, 2000, {
        competition: 20,
        vidiqCompetition: 10,
        vidiqOverall: 90,
      }),
      sample("b", 1000, 2000, {
        competition: 50,
        vidiqCompetition: 40,
        vidiqOverall: 60,
      }),
      sample("c", 1000, 2000, {
        competition: 80,
        vidiqCompetition: 70,
        vidiqOverall: 30,
      }),
      sample("d", 1000, null, { competition: 90, vidiqCompetition: 95 }),
    ]);

    expect(fit.stats.competitionSpearman).toBe(1);
    // Same estimate everywhere, so our overall falls as competition rises,
    // matching VidIQ's overall ordering.
    expect(fit.stats.overallSpearman).toBe(1);
    expect(fit.rows[3]).toMatchObject({ competition: 90, overallScore: null });
  });
});

describe("spearmanCorrelation", () => {
  it("is 1 for a monotone relation, -1 when reversed, and null for too few points", () => {
    expect(spearmanCorrelation([1, 5, 20, 100], [10, 20, 30, 40])).toBe(1);
    expect(spearmanCorrelation([1, 5, 20, 100], [40, 30, 20, 10])).toBe(-1);
    expect(spearmanCorrelation([1, 2], [1, 2])).toBeNull();
  });
});
