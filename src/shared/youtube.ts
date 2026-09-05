// SEO Forge: YouTube Research shared contracts. Row types, column definitions,
// and every scoring formula live here and NOWHERE else, so the UI table, the
// MCP text table, the CSV export, and the agent skill all describe the same
// numbers. Pure functions only (no I/O) so they are unit-tested once.
//
// Design notes (see docs/seoforge/PLAN.md section 5):
// - YouTube publishes no search volume. `searchVolume` is an ESTIMATE anchored
//   on Google Ads volume and scaled by a YouTube share derived from Google
//   Trends (type=youtube). Every row carries a confidence level and every
//   surface must present the number as an estimate.
// - Views per hour is the lifetime average since publish (one snapshot), and
//   is labelled as such.
// - Constants are grouped in YOUTUBE_SCORING; bump ESTIMATOR_VERSION whenever a
//   formula changes so cached research results are recomputed.

import { sort } from "remeda";

export const YOUTUBE_KEYWORD_KINDS = [
  "seed",
  "related",
  "matching",
  "question",
] as const;
export type YoutubeKeywordKind = (typeof YOUTUBE_KEYWORD_KINDS)[number];

export const YOUTUBE_VOLUME_CONFIDENCES = ["high", "medium", "low"] as const;
export type YoutubeVolumeConfidence =
  (typeof YOUTUBE_VOLUME_CONFIDENCES)[number];

export type YoutubeKeywordRow = {
  keyword: string;
  kind: YoutubeKeywordKind;
  /** Estimated monthly YouTube searches; null when nothing anchors it. */
  searchVolume: number | null;
  volumeConfidence: YoutubeVolumeConfidence;
  /** 0-100, higher = harder. Null when no SERP was fetched for the row. */
  competition: number | null;
  /** 0-100, higher = better opportunity. Null when volume is null. */
  overallScore: number | null;
  wordCount: number;
};

export type YoutubeVideoRow = {
  rank: number;
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelName: string | null;
  channelUrl: string | null;
  /** ISO-8601 publish time when known exactly (video info), else null. */
  publishedAt: string | null;
  /** YouTube's relative label ("1 year ago"); always available from the SERP. */
  publishedLabel: string | null;
  viewsCount: number | null;
  likesCount: number | null;
  commentsCount: number | null;
  durationSeconds: number | null;
  isShorts: boolean;
  isLive: boolean;
  /** Average views per hour since publish; null without a publish time. */
  viewsPerHour: number | null;
  subscribersCount: number | null;
  /** Video views / median views of the channel's other recent uploads. */
  channelMultiplier: number | null;
};

export type YoutubeResearchOverview = YoutubeKeywordRow & {
  /** Median views per hour across the seed's top videos. */
  medianViewsPerHour: number | null;
  videoCount: number;
};

// ---------------------------------------------------------------------------
// Scoring constants (version 1 starting points; retuned in Phase 6 calibration)
// ---------------------------------------------------------------------------

export const YOUTUBE_SCORING = {
  /** Bump on any formula/constant change so cached results are recomputed. */
  ESTIMATOR_VERSION: 1,
  /**
   * Benchmark keyword whose YouTube monthly volume is assumed known. Sent in the
   * same Trends request as the seed so the seed's relative interest can be
   * converted to an absolute estimate. Calibrated against VidIQ in Phase 6.
   */
  BENCHMARK: { keyword: "how to tie a tie", youtubeMonthlyVolume: 300_000 },
  /** YouTube searches per Google search when Trends gives no signal. */
  DEFAULT_YOUTUBE_SHARE: 0.3,
  YOUTUBE_SHARE_BOUNDS: { min: 0.02, max: 4 },
  /** How far a candidate's share moves from the default toward the seed's. */
  CANDIDATE_SHARE_DAMPING: 0.5,
  /** Trends interest at or below this counts as "no data". */
  MIN_TRENDS_INTEREST: 1,
  COMPETITION: {
    weights: {
      views: 0.4,
      subscribers: 0.25,
      freshness: 0.15,
      domination: 0.1,
      shorts: 0.1,
    },
    /** log10 bounds for median views (1k .. 10M) and subscribers (1k .. 10M). */
    viewsLog10: { min: 3, max: 7 },
    subscribersLog10: { min: 3, max: 7 },
    /** Videos younger than this many days count as fresh. */
    freshDays: 365,
  },
  /** Volume at which volumeScore saturates in the overall score. */
  OVERALL_VOLUME_UPPER_BOUND: 1_000_000,
  /** Minimum other uploads needed for a channel multiplier. */
  MIN_CHANNEL_SAMPLE: 5,
} as const;

// ---------------------------------------------------------------------------
// Keyword helpers
// ---------------------------------------------------------------------------

export function normalizeYoutubeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

export function countWords(keyword: string): number {
  const normalized = normalizeYoutubeKeyword(keyword);
  return normalized === "" ? 0 : normalized.split(" ").length;
}

const QUESTION_WORDS = new Set([
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "can",
  "does",
  "do",
  "is",
  "are",
  "should",
  "will",
]);

/**
 * Classifies a candidate relative to the seed. Question wins over matching so
 * "how to bake bread" under seed "bake bread" is a question, not a match.
 */
export function classifyKeywordKind(
  candidate: string,
  seed: string,
): Exclude<YoutubeKeywordKind, "seed"> {
  const normalized = normalizeYoutubeKeyword(candidate);
  const firstWord = normalized.split(" ")[0] ?? "";
  if (normalized.endsWith("?") || QUESTION_WORDS.has(firstWord)) {
    return "question";
  }
  const words = new Set(normalized.split(" "));
  const seedWords = normalizeYoutubeKeyword(seed).split(" ");
  return seedWords.every((word) => words.has(word)) ? "matching" : "related";
}

// ---------------------------------------------------------------------------
// Video metrics
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

/** Lifetime average views per hour since publish. */
export function computeViewsPerHour(
  viewsCount: number | null,
  publishedAt: string | null,
  now: Date,
): number | null {
  if (viewsCount == null || !publishedAt) return null;
  const published = Date.parse(publishedAt);
  if (Number.isNaN(published)) return null;
  const hours = Math.max(1, (now.getTime() - published) / HOUR_MS);
  return viewsCount / hours;
}

const RELATIVE_UNIT_MS: Record<string, number> = {
  second: 1000,
  minute: 60 * 1000,
  hour: HOUR_MS,
  day: 24 * HOUR_MS,
  week: 7 * 24 * HOUR_MS,
  month: 30 * 24 * HOUR_MS,
  year: 365 * 24 * HOUR_MS,
};

/**
 * Converts YouTube's relative label ("1 year ago", "Streamed 3 weeks ago") to
 * an approximate ISO timestamp. Coarse by nature; used for freshness buckets,
 * never for precise views-per-hour when an exact time is available.
 */
export function parseRelativePublicationDate(
  label: string | null,
  now: Date,
): string | null {
  if (!label) return null;
  const match = label
    .toLowerCase()
    .match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = RELATIVE_UNIT_MS[match[2] ?? ""];
  if (!unit || !Number.isFinite(amount)) return null;
  return new Date(now.getTime() - amount * unit).toISOString();
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = sort(values, (a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return value;
}

/** Video views relative to the channel's other recent uploads (e.g. 35x). */
export function computeChannelMultiplier(
  videoViews: number | null,
  otherUploadViews: readonly number[],
): number | null {
  if (videoViews == null) return null;
  if (otherUploadViews.length < YOUTUBE_SCORING.MIN_CHANNEL_SAMPLE) return null;
  const channelMedian = median(otherUploadViews);
  if (channelMedian == null || channelMedian <= 0) return null;
  return videoViews / channelMedian;
}

// ---------------------------------------------------------------------------
// Competition
// ---------------------------------------------------------------------------

export type CompetitionVideoInput = {
  viewsCount: number | null;
  subscribersCount: number | null;
  publishedAt: string | null;
  isShorts: boolean;
  channelId: string | null;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizeLog10(value: number, bounds: { min: number; max: number }) {
  const log = Math.log10(Math.max(1, value));
  return clamp01((log - bounds.min) / (bounds.max - bounds.min));
}

/**
 * 0-100 competition from the top results. Views and (when available)
 * subscribers measure how established the ranking videos are; freshness,
 * channel domination and Shorts share adjust it. Subscriber weight is folded
 * into views when no result carries a subscriber count (row-level SERPs).
 */
export function computeCompetition(
  videos: readonly CompetitionVideoInput[],
  now: Date,
): number | null {
  if (videos.length === 0) return null;
  const { weights, viewsLog10, subscribersLog10, freshDays } =
    YOUTUBE_SCORING.COMPETITION;

  const views = videos.flatMap((v) =>
    v.viewsCount != null ? [v.viewsCount] : [],
  );
  const subscribers = videos.flatMap((v) =>
    v.subscribersCount != null ? [v.subscribersCount] : [],
  );
  const medianViews = median(views);
  if (medianViews == null) return null;
  const medianSubscribers = median(subscribers);

  const freshCutoff = now.getTime() - freshDays * 24 * HOUR_MS;
  const withDate = videos.filter((v) => v.publishedAt != null);
  const freshShare =
    withDate.length === 0
      ? 0.5
      : withDate.filter((v) => Date.parse(v.publishedAt ?? "") >= freshCutoff)
          .length / withDate.length;
  const shortsShare = videos.filter((v) => v.isShorts).length / videos.length;
  const channels = new Set(
    videos.flatMap((v) => (v.channelId ? [v.channelId] : [])),
  );
  const distinctRatio = channels.size === 0 ? 1 : channels.size / videos.length;

  const viewsScore = normalizeLog10(medianViews, viewsLog10);
  const subscribersScore =
    medianSubscribers == null
      ? null
      : normalizeLog10(medianSubscribers, subscribersLog10);

  const viewsWeight =
    subscribersScore == null
      ? weights.views + weights.subscribers
      : weights.views;
  const score =
    viewsScore * viewsWeight +
    (subscribersScore ?? 0) *
      (subscribersScore == null ? 0 : weights.subscribers) +
    (1 - freshShare) * weights.freshness +
    (1 - distinctRatio) * weights.domination +
    (1 - shortsShare) * weights.shorts;

  return Math.round(clamp01(score) * 100);
}

// ---------------------------------------------------------------------------
// Search volume estimate
// ---------------------------------------------------------------------------

/**
 * Seed YouTube share = (seed interest / benchmark interest) * benchmark YouTube
 * volume / seed Google anchor. Null when Trends has no signal for either term.
 */
export function computeSeedYoutubeShare(input: {
  seedInterest: number | null;
  benchmarkInterest: number | null;
  anchorVolume: number | null;
}): number | null {
  const { seedInterest, benchmarkInterest, anchorVolume } = input;
  if (
    seedInterest == null ||
    benchmarkInterest == null ||
    anchorVolume == null ||
    anchorVolume <= 0 ||
    seedInterest < YOUTUBE_SCORING.MIN_TRENDS_INTEREST ||
    benchmarkInterest < YOUTUBE_SCORING.MIN_TRENDS_INTEREST
  ) {
    return null;
  }
  const estimatedYoutubeVolume =
    (seedInterest / benchmarkInterest) *
    YOUTUBE_SCORING.BENCHMARK.youtubeMonthlyVolume;
  const share = estimatedYoutubeVolume / anchorVolume;
  const { min, max } = YOUTUBE_SCORING.YOUTUBE_SHARE_BOUNDS;
  return Math.min(max, Math.max(min, share));
}

export function estimateSearchVolume(input: {
  anchorVolume: number | null;
  /** Share derived from Trends for the seed; null when unavailable. */
  seedShare: number | null;
  isSeed: boolean;
}): { searchVolume: number | null; volumeConfidence: YoutubeVolumeConfidence } {
  const { anchorVolume, seedShare, isSeed } = input;
  if (anchorVolume == null || anchorVolume <= 0) {
    return { searchVolume: null, volumeConfidence: "low" };
  }
  const base = YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE;
  if (seedShare == null) {
    return {
      searchVolume: Math.round(anchorVolume * base),
      volumeConfidence: "medium",
    };
  }
  if (isSeed) {
    return {
      searchVolume: Math.round(anchorVolume * seedShare),
      volumeConfidence: "high",
    };
  }
  const share =
    base + (seedShare - base) * YOUTUBE_SCORING.CANDIDATE_SHARE_DAMPING;
  return {
    searchVolume: Math.round(anchorVolume * share),
    volumeConfidence: "medium",
  };
}

// ---------------------------------------------------------------------------
// Overall score
// ---------------------------------------------------------------------------

/** Geometric blend of volume and (100 - competition), 0-100. */
export function computeOverallScore(
  searchVolume: number | null,
  competition: number | null,
): number | null {
  if (searchVolume == null) return null;
  const volumeScore = clamp01(
    Math.log10(searchVolume + 1) /
      Math.log10(YOUTUBE_SCORING.OVERALL_VOLUME_UPPER_BOUND + 1),
  );
  // Unknown competition is treated as middling rather than as zero.
  const ease = 1 - (competition ?? 50) / 100;
  return Math.round(100 * Math.sqrt(volumeScore) * Math.sqrt(ease));
}
