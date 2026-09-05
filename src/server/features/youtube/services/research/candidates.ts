import { fetchYoutubeSuggestions } from "@/server/lib/youtubeAutocompleteClient";
import {
  classifyKeywordKind,
  countWords,
  normalizeYoutubeKeyword,
  type YoutubeKeywordKind,
} from "@/shared/youtube";
import { YOUTUBE_FETCH_CONCURRENCY, mapWithConcurrency } from "./helpers";

// SEO Forge: candidate keyword generation for a seed. Candidates come from the
// YouTube suggest endpoint (seed, seed + a-z, question prefix + seed) and from
// Google Trends related queries for the seed, which the caller fetches (it is
// metered) and passes in. Output is de-duplicated, normalised, classified and
// capped BEFORE any paid hydration so the cap bounds spend.

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

type YoutubeCandidateSource = "suggest" | "trends_top" | "trends_rising";

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

type GenerateCandidatesInput = {
  seed: string;
  locationCode: number;
  languageCode: string;
  /** Google Trends related queries for the seed (top first, then rising). */
  trendsRelated: { top: string[]; rising: string[] };
  limit?: number;
};

type GenerateCandidatesResult = {
  candidates: YoutubeCandidate[];
  suggestionCount: number;
  suggestCalls: number;
};

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
  const terms = buildSuggestTerms(seed);
  const suggestionLists = await mapWithConcurrency(
    terms,
    YOUTUBE_FETCH_CONCURRENCY,
    (term) =>
      fetchYoutubeSuggestions({
        term,
        languageCode: input.languageCode,
        locationCode: input.locationCode,
      }),
  );
  const suggestionCount = suggestionLists.reduce(
    (sum, list) => sum + list.length,
    0,
  );

  const ordered: Array<{ keyword: string; source: YoutubeCandidateSource }> = [
    ...(suggestionLists[0] ?? []).map((keyword) => ({
      keyword,
      source: "suggest" as const,
    })),
    ...input.trendsRelated.top.map((keyword) => ({
      keyword,
      source: "trends_top" as const,
    })),
    ...input.trendsRelated.rising.map((keyword) => ({
      keyword,
      source: "trends_rising" as const,
    })),
    ...suggestionLists
      .slice(1)
      .flat()
      .map((keyword) => ({ keyword, source: "suggest" as const })),
  ];

  const seen = new Set<string>([seed]);
  const candidates: YoutubeCandidate[] = [];
  for (const entry of ordered) {
    if (candidates.length >= limit) break;
    // A trailing "?" would fail the Google Ads charset; the first word still
    // classifies the phrase as a question.
    const keyword = normalizeYoutubeKeyword(entry.keyword.replace(/\?+$/, ""));
    if (seen.has(keyword) || !isUsableCandidate(keyword)) continue;
    seen.add(keyword);
    candidates.push({
      keyword,
      kind: classifyKeywordKind(keyword, seed),
      source: entry.source,
    });
  }

  return { candidates, suggestionCount, suggestCalls: terms.length };
}
