import { sort } from "remeda";
import {
  YOUTUBE_SCORING,
  computeOverallScore,
  normalizeYoutubeKeyword,
} from "./youtube";

// SEO Forge: fits the volume-estimator constants in YOUTUBE_SCORING to a VidIQ
// sample (Phase 6 of docs/seoforge/PLAN.md). Pure so it is unit-tested; the
// CLI in scripts/youtube-volume-calibration.ts gathers the provider inputs and
// prints the proposal. The estimate arithmetic here mirrors
// estimateSearchVolume/computeSeedYoutubeShare with the constants as inputs.

export type CalibrationSample = {
  keyword: string;
  /** VidIQ's reported monthly YouTube searches. */
  vidiqVolume: number;
  /** Google Ads monthly volume, null when Google Ads has no data. */
  anchorVolume: number | null;
  /** Mean trailing Trends (type youtube) interest, from a batch that also carried the benchmark. */
  interest: number | null;
  /** The benchmark's mean trailing interest in that same batch. */
  benchmarkInterest: number | null;
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
  benchmark: { keyword: string; youtubeMonthlyVolume: number };
  defaultYoutubeShare: number;
  youtubeShareBounds: { min: number; max: number };
  stats: {
    sampleCount: number;
    anchoredCount: number;
    withTrendsCount: number;
    medianRatio: number | null;
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

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = sort(values, (a, b) => a - b);
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
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

export function fitYoutubeScoring(
  samples: readonly CalibrationSample[],
  benchmarkKeyword: string = YOUTUBE_SCORING.BENCHMARK.keyword,
): CalibrationFit {
  const benchmark = normalizeYoutubeKeyword(benchmarkKeyword);
  const benchmarkSample = samples.find(
    (sample) => normalizeYoutubeKeyword(sample.keyword) === benchmark,
  );
  // Without the benchmark in the sample, every keyword with a Trends signal
  // implies a benchmark volume: vidiq * benchmarkInterest / interest. The
  // median of those is robust to a few outliers.
  const impliedBenchmarkVolumes = samples.flatMap((sample) =>
    sample.interest != null &&
    sample.benchmarkInterest != null &&
    sample.interest >= YOUTUBE_SCORING.MIN_TRENDS_INTEREST &&
    sample.benchmarkInterest >= YOUTUBE_SCORING.MIN_TRENDS_INTEREST &&
    sample.vidiqVolume > 0
      ? [(sample.vidiqVolume * sample.benchmarkInterest) / sample.interest]
      : [],
  );
  const benchmarkVolume = Math.round(
    benchmarkSample?.vidiqVolume ??
      median(impliedBenchmarkVolumes) ??
      YOUTUBE_SCORING.BENCHMARK.youtubeMonthlyVolume,
  );

  const impliedShares = samples.flatMap((sample) =>
    sample.anchorVolume != null &&
    sample.anchorVolume > 0 &&
    sample.vidiqVolume > 0
      ? [sample.vidiqVolume / sample.anchorVolume]
      : [],
  );
  const defaultYoutubeShare = round(
    median(impliedShares) ?? YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE,
    3,
  );
  const bounds = {
    min: round(
      Math.max(
        0.001,
        percentile(impliedShares, 5) ??
          YOUTUBE_SCORING.YOUTUBE_SHARE_BOUNDS.min,
      ),
      3,
    ),
    max: round(
      percentile(impliedShares, 95) ?? YOUTUBE_SCORING.YOUTUBE_SHARE_BOUNDS.max,
      3,
    ),
  };

  const rows: CalibrationRow[] = samples.map((sample) => {
    if (sample.anchorVolume == null || sample.anchorVolume <= 0) {
      return {
        ...pick(sample),
        estimate: null,
        ratio: null,
        overallScore: null,
      };
    }
    const hasTrends =
      sample.interest != null &&
      sample.benchmarkInterest != null &&
      sample.interest >= YOUTUBE_SCORING.MIN_TRENDS_INTEREST &&
      sample.benchmarkInterest >= YOUTUBE_SCORING.MIN_TRENDS_INTEREST;
    const share = hasTrends
      ? Math.min(
          bounds.max,
          Math.max(
            bounds.min,
            (((sample.interest ?? 0) / (sample.benchmarkInterest ?? 1)) *
              benchmarkVolume) /
              sample.anchorVolume,
          ),
        )
      : defaultYoutubeShare;
    const estimate = Math.round(sample.anchorVolume * share);
    return {
      ...pick(sample),
      estimate,
      ratio: sample.vidiqVolume > 0 ? estimate / sample.vidiqVolume : null,
      overallScore: computeOverallScore(estimate, sample.competition ?? null),
    };
  });

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
    benchmark: { keyword: benchmark, youtubeMonthlyVolume: benchmarkVolume },
    defaultYoutubeShare,
    youtubeShareBounds: bounds,
    stats: {
      sampleCount: samples.length,
      anchoredCount: impliedShares.length,
      withTrendsCount: samples.filter(
        (sample) => sample.interest != null && sample.benchmarkInterest != null,
      ).length,
      medianRatio: median(
        rows.flatMap((row) => (row.ratio == null ? [] : [row.ratio])),
      ),
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

function pick(sample: CalibrationSample) {
  return {
    keyword: sample.keyword,
    vidiqVolume: sample.vidiqVolume,
    anchorVolume: sample.anchorVolume,
    competition: sample.competition ?? null,
  };
}
