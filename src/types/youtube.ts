import type {
  YoutubeKeywordRow,
  YoutubeResearchOverview,
  YoutubeVideoRow,
} from "@/shared/youtube";

// SEO Forge: result shapes returned by the YouTube service and consumed
// unchanged by the server functions and the MCP tools (one service, three
// callers). Row types live in src/shared/youtube.ts next to the formulas.

export type YoutubeDataApiStatus = "ok" | "not_configured" | "error";

/** Counts of the external calls one research run actually made (cache hits excluded). */
export type YoutubeResearchApiCalls = {
  youtubeSerp: number;
  videoInfo: number;
  trends: number;
  adsSearchVolume: number;
  suggest: number;
};

export type YoutubeResearchDiagnostics = {
  candidateCount: number;
  suggestionCount: number;
  trendsRelatedCount: number;
  /** Candidates (plus seed) for which Google Ads returned a volume. */
  anchoredCount: number;
  /** Candidate rows that received their own SERP for competition. */
  serpRowCount: number;
  /** Mean trailing Google Trends (type youtube) interest for the seed; null without signal. */
  seedInterest: number | null;
  apiCalls: YoutubeResearchApiCalls;
};

export type YoutubeResearchResult = {
  seed: YoutubeResearchOverview;
  rows: YoutubeKeywordRow[];
  diagnostics: YoutubeResearchDiagnostics;
  fetchedAt: string;
};

export type YoutubeVideosResult = {
  keyword: string;
  rows: YoutubeVideoRow[];
  dataApiStatus: YoutubeDataApiStatus;
  fetchedAt: string;
};

export type YoutubeSavedKeywordRow = YoutubeKeywordRow & {
  id: string;
  projectId: string;
  locationCode: number;
  languageCode: string;
  fetchedAt: string | null;
  createdAt: string;
};
