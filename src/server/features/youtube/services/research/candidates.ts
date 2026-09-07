import { sortBy } from "remeda";
import { fetchYoutubeSuggestions } from "@/server/lib/youtubeAutocompleteClient";
import {
  classifyKeywordKind,
  countWords,
  normalizeYoutubeKeyword,
  type YoutubeKeywordKind,
} from "@/shared/youtube";
import { YOUTUBE_FETCH_CONCURRENCY, mapWithConcurrency } from "./helpers";

// SEO Forge: candidate keyword generation for a seed. Three sources, each held
// to a relevance rule so a name like "sarah tang" does not turn into a list of
// other Sarahs:
// - YouTube suggest (seed, question prefix + seed, seed + a-z): kept only when
//   the suggestion still contains every seed word. YouTube autocompletes a
//   prefix it cannot extend by dropping words ("sarah tang b" -> "sarah b..."),
//   and those fuzzy results were the off-topic "related" rows.
// - Tags of the videos ranking for the seed (from video info): the uploaders'
//   own keywords, kept when at least two ranking videos share the tag or the
//   tag shares a word with the seed. These are the "related" rows.
// - Google Trends related queries for the seed: kept when they share a word
//   with the seed or match a ranking video's tag.
// Output is de-duplicated, normalised, classified and capped BEFORE any paid
// hydration so the cap bounds spend.

/** Upper bound on candidates hydrated with Google Ads volume and row SERPs. */
const YOUTUBE_CANDIDATE_LIMIT = 200;

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const QUESTION_PREFIXES = [
  "how to",
  "why",
  "what",
  "when",
  "can",
  "is",
  "does",
  "should",
  "best",
];

const MAX_CANDIDATE_LENGTH = 80;
const MAX_CANDIDATE_WORDS = 10;
// Google Ads search_volume rejects the whole batch when one keyword carries
// punctuation it does not accept, so only plain words survive.
const CANDIDATE_CHARSET = /^[\p{L}\p{N} '-]+$/u;

/** Words that never count as shared topic between a seed and a candidate. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "in",
  "on",
  "at",
  "and",
  "or",
  "vs",
  "with",
  "without",
  "my",
  "your",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "which",
  "is",
  "are",
  "can",
  "do",
  "does",
  "should",
  "best",
  "top",
  "new",
  "video",
  "videos",
  "youtube",
  "shorts",
]);

/** Uploader tags that describe the platform or format, not the topic. */
const GENERIC_TAGS = new Set([
  "video",
  "videos",
  "youtube",
  "shorts",
  "vlog",
  "viral",
  "trending",
  "funny",
  "new",
  "official",
  "hd",
  "4k",
]);

/** Tags must appear on this many ranking videos unless they share a seed word. */
const MIN_TAG_VIDEOS = 2;

type YoutubeCandidateSource =
  | "suggest"
  | "tag"
  | "trends_top"
  | "trends_rising";

function tokens(keyword: string): string[] {
  return normalizeYoutubeKeyword(keyword)
    .split(" ")
    .filter((token) => token.length > 0);
}

/** Loose stem so "recipes" matches "recipe". */
function stem(token: string): string {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function topicTokens(keyword: string): Set<string> {
  return new Set(
    tokens(keyword)
      .filter((token) => !STOPWORDS.has(token))
      .map(stem),
  );
}

/** Every seed word appears in the candidate (the seed phrase survived). */
export function containsSeed(candidate: string, seed: string): boolean {
  const candidateTokens = new Set(tokens(candidate).map(stem));
  return tokens(seed)
    .map(stem)
    .every((token) => candidateTokens.has(token));
}

/** At least one topic word is shared, so the candidate is about the seed. */
export function sharesTopic(candidate: string, seed: string): boolean {
  const seedTopic = topicTokens(seed);
  if (seedTopic.size === 0) return containsSeed(candidate, seed);
  return [...topicTokens(candidate)].some((token) => seedTopic.has(token));
}

type YoutubeCandidate = {
  keyword: string;
  kind: Exclude<YoutubeKeywordKind, "seed">;
  source: YoutubeCandidateSource;
};

export function isUsableCandidate(keyword: string): boolean {
  return (
    keyword.length > 0 &&
    keyword.length <= MAX_CANDIDATE_LENGTH &&
    countWords(keyword) <= MAX_CANDIDATE_WORDS &&
    CANDIDATE_CHARSET.test(keyword)
  );
}

/** The suggest queries issued for a seed, in the order their results are kept. */
function buildSuggestTerms(seed: string): string[] {
  return [
    seed,
    ...QUESTION_PREFIXES.map((prefix) => `${prefix} ${seed}`),
    ...LETTERS.map((letter) => `${seed} ${letter}`),
  ];
}

type SuggestionLists = { seed: string; lists: string[][] };

/**
 * The free suggest fan-out (seed, question prefixes, seed + a-z). Independent
 * of every paid call, so the orchestration starts it alongside the seed SERP.
 */
export async function fetchSuggestionLists(input: {
  seed: string;
  locationCode: number;
  languageCode: string;
}): Promise<SuggestionLists> {
  const seed = normalizeYoutubeKeyword(input.seed);
  const lists = await mapWithConcurrency(
    buildSuggestTerms(seed),
    YOUTUBE_FETCH_CONCURRENCY,
    (term) =>
      fetchYoutubeSuggestions({
        term,
        languageCode: input.languageCode,
        locationCode: input.locationCode,
      }),
  );
  return { seed, lists };
}

type GenerateCandidatesInput = {
  seed: string;
  locationCode: number;
  languageCode: string;
  /** Google Trends related queries for the seed (top first, then rising). */
  trendsRelated: { top: string[]; rising: string[] };
  limit?: number;
  /** Pre-fetched suggest results; fetched here when omitted. */
  suggestions?: SuggestionLists;
  /** Uploader tags of each video ranking for the seed. */
  seedVideoTags?: readonly (readonly string[])[];
};

type GenerateCandidatesResult = {
  candidates: YoutubeCandidate[];
  suggestionCount: number;
  suggestCalls: number;
  /** Distinct ranking-video tags that qualified as candidates. */
  tagCandidateCount: number;
  /** Suggestions and Trends queries dropped for losing the seed's topic. */
  droppedOffTopicCount: number;
};

/**
 * Tags shared by the ranking videos, most shared first. A tag on a single
 * video only counts when it shares a word with the seed.
 */
function rankTags(
  seed: string,
  seedVideoTags: readonly (readonly string[])[],
): string[] {
  const videosPerTag = new Map<string, number>();
  for (const videoTags of seedVideoTags) {
    for (const tag of new Set(videoTags.map(normalizeYoutubeKeyword))) {
      if (!tag || GENERIC_TAGS.has(tag)) continue;
      videosPerTag.set(tag, (videosPerTag.get(tag) ?? 0) + 1);
    }
  }
  return sortBy(
    [...videosPerTag.entries()].filter(
      ([tag, count]) => count >= MIN_TAG_VIDEOS || sharesTopic(tag, seed),
    ),
    [([, count]) => count, "desc"],
  ).map(([tag]) => tag);
}

/**
 * Suggest results for the bare seed rank first, then Trends related queries,
 * then question-prefixed and letter-expanded suggestions; the cap keeps the
 * most relevant ones.
 */
export async function generateCandidates(
  input: GenerateCandidatesInput,
): Promise<GenerateCandidatesResult> {
  const seed = normalizeYoutubeKeyword(input.seed);
  const limit = input.limit ?? YOUTUBE_CANDIDATE_LIMIT;
  const suggestionLists = (
    input.suggestions?.seed === seed
      ? input.suggestions
      : await fetchSuggestionLists(input)
  ).lists;
  const suggestionCount = suggestionLists.reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const tagCandidates = rankTags(seed, input.seedVideoTags ?? []);
  const tagSet = new Set(tagCandidates);
  let droppedOffTopicCount = 0;
  // A trailing "?" would fail the Google Ads charset and confuse the word
  // checks; the first word still classifies the phrase as a question.
  const clean = (keyword: string) => keyword.replace(/\?+$/, "");
  const suggestEntries = (list: string[]) =>
    list.map(clean).flatMap((keyword) => {
      // Suggestions that lost a seed word are YouTube's fuzzy completions of a
      // prefix it could not extend; they are about something else.
      if (!containsSeed(keyword, seed)) {
        droppedOffTopicCount += 1;
        return [];
      }
      return [{ keyword, source: "suggest" as const }];
    });
  const trendsEntries = (list: string[], source: YoutubeCandidateSource) =>
    list.map(clean).flatMap((keyword) => {
      if (
        !sharesTopic(keyword, seed) &&
        !tagSet.has(normalizeYoutubeKeyword(keyword))
      ) {
        droppedOffTopicCount += 1;
        return [];
      }
      return [{ keyword, source }];
    });

  const ordered: Array<{ keyword: string; source: YoutubeCandidateSource }> = [
    ...suggestEntries(suggestionLists[0] ?? []),
    ...tagCandidates.map((keyword) => ({ keyword, source: "tag" as const })),
    ...trendsEntries(input.trendsRelated.top, "trends_top"),
    ...trendsEntries(input.trendsRelated.rising, "trends_rising"),
    ...suggestEntries(suggestionLists.slice(1).flat()),
  ];

  const seen = new Set<string>([seed]);
  const candidates: YoutubeCandidate[] = [];
  for (const entry of ordered) {
    if (candidates.length >= limit) break;
    const keyword = normalizeYoutubeKeyword(entry.keyword);
    if (seen.has(keyword) || !isUsableCandidate(keyword)) continue;
    seen.add(keyword);
    candidates.push({
      keyword,
      kind: classifyKeywordKind(keyword, seed),
      source: entry.source,
    });
  }

  return {
    candidates,
    suggestionCount,
    suggestCalls: suggestionLists.length,
    tagCandidateCount: tagCandidates.length,
    droppedOffTopicCount,
  };
}
