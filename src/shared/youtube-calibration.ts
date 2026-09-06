import { sort } from "remeda";
import { YOUTUBE_SCORING, computeOverallScore } from "./youtube";

// SEO Forge: fits the volume power law in YOUTUBE_SCORING to a VidIQ sample
// (Phase 6 of docs/seoforge/PLAN.md). Pure so it is unit-tested; the CLI in
// scripts/youtube-volume-calibration.ts gathers the provider inputs and prints
// the proposal. log10(vidiq) = a + b * log10(google) is fitted by least squares
// on rows with a Google anchor and an exact (not "<N") VidIQ volume.

export type CalibrationSample = {
  keyword: string;
  /** VidIQ's reported monthly YouTube searches. */
  vidiqVolume: number;
  /** True when VidIQ reported an upper bound ("<750"); excluded from the fit. */
  vidiqIsUpperBound?: boolean;
  /** Google Ads monthly volume, null when Google Ads has no data. */
  anchorVolume: number | null;
  /** Our competition score from one YouTube SERP, when the CLI bought it. */
  competition?: number | null;
  /** VidIQ's competition and overall scores, when the export carried them. */
  vidiqCompetition?: number | null;
  vidiqOverall?: number | null;
};

type CalibrationRow = {
  keyword: string;
  vidiqVolume: number;
  anchorVolume: number | null;
  estimate: number | null;
  /** estimate / vidiqVolume; 1 means exact, 2 means twice VidIQ. */
  ratio: number | null;
  competition: number | null;
  overallScore: number | null;
};

type CalibrationFit = {
  powerLaw: { coefficient: number; exponent: number };
  stats: {
    sampleCount: number;
    anchoredCount: number;
    fittedCount: number;
    medianRatio: number | null;
    within3x: number | null;
    within10x: number | null;
    /** Spearman rank correlation between estimates and VidIQ volumes. */
    spearman: number | null;
    /** Rank correlations of our scores with VidIQ's, when both sides exist. */
    competitionSpearman: number | null;
    overallSpearman: number | null;
  };
  rows: CalibrationRow[];
};

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = sort(values, (a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/** Average ranks for ties, 1-based. */
function ranks(values: readonly number[]): number[] {
  const indexed = sort(
    values.map((value, index) => ({ value, index })),
    (a, b) => a.value - b.value,
  );
  const result = Array.from({ length: values.length }, () => 0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (
      j + 1 < indexed.length &&
      indexed[j + 1]?.value === indexed[i]?.value
    ) {
      j += 1;
    }
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) {
      const entry = indexed[k];
      if (entry) result[entry.index] = rank;
    }
    i = j + 1;
  }
  return result;
}

export function spearmanCorrelation(
  left: readonly number[],
  right: readonly number[],
): number | null {
  if (left.length !== right.length || left.length < 3) return null;
  const a = ranks(left);
  const b = ranks(right);
  const meanA = a.reduce((sum, v) => sum + v, 0) / a.length;
  const meanB = b.reduce((sum, v) => sum + v, 0) / b.length;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const da = (a[i] ?? 0) - meanA;
    const db = (b[i] ?? 0) - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Least-squares fit of log10(vidiq) = a + b * log10(anchor). */
function fitPowerLaw(
  pairs: ReadonlyArray<readonly [anchor: number, vidiq: number]>,
): { coefficient: number; exponent: number } | null {
  if (pairs.length < 3) return null;
  const xs = pairs.map(([anchor]) => Math.log10(anchor));
  const ys = pairs.map(([, vidiq]) => Math.log10(vidiq));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  let cov = 0;
  let varX = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    cov += dx * ((ys[i] ?? 0) - meanY);
    varX += dx * dx;
  }
  if (varX === 0) return null;
  const exponent = cov / varX;
  const coefficient = 10 ** (meanY - exponent * meanX);
  return { coefficient: round(coefficient, 0), exponent: round(exponent, 3) };
}

export function fitYoutubeScoring(
  samples: readonly CalibrationSample[],
): CalibrationFit {
  const fitPairs = samples.flatMap((sample) =>
    sample.anchorVolume != null &&
    sample.anchorVolume > 0 &&
    sample.vidiqVolume > 0 &&
    !sample.vidiqIsUpperBound
      ? [[sample.anchorVolume, sample.vidiqVolume] as const]
      : [],
  );
  const powerLaw = fitPowerLaw(fitPairs) ?? YOUTUBE_SCORING.VOLUME_POWER_LAW;

  const rows: CalibrationRow[] = samples.map((sample) => {
    const base = {
      keyword: sample.keyword,
      vidiqVolume: sample.vidiqVolume,
      anchorVolume: sample.anchorVolume,
      competition: sample.competition ?? null,
    };
    if (sample.anchorVolume == null || sample.anchorVolume <= 0) {
      return { ...base, estimate: null, ratio: null, overallScore: null };
    }
    const estimate = Math.round(
      powerLaw.coefficient * sample.anchorVolume ** powerLaw.exponent,
    );
    return {
      ...base,
      estimate,
      ratio: sample.vidiqVolume > 0 ? estimate / sample.vidiqVolume : null,
      overallScore: computeOverallScore(estimate, sample.competition ?? null),
    };
  });

  const ratios = rows.flatMap((row) => (row.ratio == null ? [] : [row.ratio]));
  const share = (predicate: (ratio: number) => boolean) =>
    ratios.length === 0
      ? null
      : round(ratios.filter(predicate).length / ratios.length, 3);
  const paired = rows.filter((row) => row.estimate != null);
  const competitionPairs = samples.flatMap((sample) =>
    sample.competition != null && sample.vidiqCompetition != null
      ? [[sample.competition, sample.vidiqCompetition] as const]
      : [],
  );
  const overallPairs = rows.flatMap((row, index) => {
    const vidiqOverall = samples[index]?.vidiqOverall;
    return row.overallScore != null && vidiqOverall != null
      ? [[row.overallScore, vidiqOverall] as const]
      : [];
  });

  return {
    powerLaw,
    stats: {
      sampleCount: samples.length,
      anchoredCount: paired.length,
      fittedCount: fitPairs.length,
      medianRatio: median(ratios),
      within3x: share((ratio) => ratio >= 1 / 3 && ratio <= 3),
      within10x: share((ratio) => ratio >= 0.1 && ratio <= 10),
      spearman: spearmanCorrelation(
        paired.map((row) => row.estimate ?? 0),
        paired.map((row) => row.vidiqVolume),
      ),
      competitionSpearman: spearmanCorrelation(
        competitionPairs.map(([ours]) => ours),
        competitionPairs.map(([, theirs]) => theirs),
      ),
      overallSpearman: spearmanCorrelation(
        overallPairs.map(([ours]) => ours),
        overallPairs.map(([, theirs]) => theirs),
      ),
    },
    rows,
  };
}
