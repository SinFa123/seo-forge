import { z } from "zod";
import {
  YOUTUBE_KEYWORD_KINDS,
  YOUTUBE_VOLUME_CONFIDENCES,
} from "@/shared/youtube";

// SEO Forge: Zod contracts shared by the YouTube route search params, server
// functions, and MCP tools, mirroring src/types/schemas/keywords.ts.

export const YOUTUBE_SERP_ROW_LIMIT_DEFAULT = 30;
export const YOUTUBE_SERP_ROW_LIMIT_MAX = 200;
export const YOUTUBE_VIDEOS_DEPTH_DEFAULT = 20;
export const YOUTUBE_VIDEOS_DEPTH_MAX = 100;

export const youtubeSortFields = [
  "searchVolume",
  "competition",
  "overallScore",
  "wordCount",
  "keyword",
] as const;
export type YoutubeSortField = (typeof youtubeSortFields)[number];

export const youtubeSavedSortFields = [
  "createdAt",
  "keyword",
  "searchVolume",
  "competition",
  "overallScore",
  "wordCount",
] as const;

export const youtubeTabs = ["keywords", "videos", "saved"] as const;
export type YoutubeTab = (typeof youtubeTabs)[number];

export const youtubeSortDirs = ["asc", "desc"] as const;
export type YoutubeSortDir = (typeof youtubeSortDirs)[number];
const keywordInputSchema = z.string().trim().min(1).max(200);
const marketSchema = {
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
};

export const researchYoutubeKeywordsSchema = z.object({
  projectId: z.string().min(1),
  keyword: keywordInputSchema,
  ...marketSchema,
  // Candidate rows get a SERP each for competition; this caps the paid calls.
  serpRowLimit: z
    .number()
    .int()
    .min(0)
    .max(YOUTUBE_SERP_ROW_LIMIT_MAX)
    .default(YOUTUBE_SERP_ROW_LIMIT_DEFAULT),
});

export const getYoutubeVideosSchema = z.object({
  projectId: z.string().min(1),
  keyword: keywordInputSchema,
  ...marketSchema,
  depth: z
    .number()
    .int()
    .min(20)
    .max(YOUTUBE_VIDEOS_DEPTH_MAX)
    .default(YOUTUBE_VIDEOS_DEPTH_DEFAULT),
});

/**
 * One scored keyword row (the `YoutubeKeywordRow` contract). Doubles as the
 * saved-keyword input, the R2 cache read validator, and the MCP output row.
 */
export const youtubeKeywordRowSchema = z.object({
  keyword: keywordInputSchema,
  kind: z.enum(YOUTUBE_KEYWORD_KINDS),
  searchVolume: z.number().int().nonnegative().nullable(),
  volumeConfidence: z.enum(YOUTUBE_VOLUME_CONFIDENCES),
  competition: z.number().int().min(0).max(100).nullable(),
  overallScore: z.number().int().min(0).max(100).nullable(),
  wordCount: z.number().int().nonnegative(),
});

export const youtubeVideoRowSchema = z.object({
  rank: z.number().int().positive(),
  videoId: z.string(),
  title: z.string(),
  url: z.string(),
  thumbnailUrl: z.string().nullable(),
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  channelUrl: z.string().nullable(),
  publishedAt: z.string().nullable(),
  publishedLabel: z.string().nullable(),
  viewsCount: z.number().nullable(),
  likesCount: z.number().nullable(),
  commentsCount: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  isShorts: z.boolean(),
  isLive: z.boolean(),
  viewsPerHour: z.number().nullable(),
  subscribersCount: z.number().nullable(),
  channelMultiplier: z.number().nullable(),
});

export const saveYoutubeKeywordsSchema = z.object({
  projectId: z.string().min(1),
  ...marketSchema,
  rows: z.array(youtubeKeywordRowSchema).min(1).max(500),
});

export const getSavedYoutubeKeywordsSchema = z.object({
  projectId: z.string().min(1),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(200).default(50),
  sort: z.enum(youtubeSavedSortFields).default("createdAt"),
  order: z.enum(youtubeSortDirs).default("desc"),
});

export const removeSavedYoutubeKeywordsSchema = z.object({
  projectId: z.string().min(1),
  savedKeywordIds: z.array(z.string().min(1)).min(1).max(2000),
});

/** Route search params for /p/$projectId/youtube. The URL is the page state. */
export const youtubeSearchSchema = z.object({
  q: z.string().optional(),
  loc: z.coerce.number().int().positive().optional(),
  lang: z.string().min(2).max(8).optional(),
  tab: z.enum(youtubeTabs).optional(),
  sort: z.enum(youtubeSortFields).optional(),
  order: z.enum(youtubeSortDirs).optional(),
  rows: z.coerce
    .number()
    .int()
    .min(0)
    .max(YOUTUBE_SERP_ROW_LIMIT_MAX)
    .optional(),
  kind: z.enum(YOUTUBE_KEYWORD_KINDS).optional(),
});

export type ResearchYoutubeKeywordsInput = z.infer<
  typeof researchYoutubeKeywordsSchema
>;
export type GetYoutubeVideosInput = z.infer<typeof getYoutubeVideosSchema>;
export type SaveYoutubeKeywordsInput = z.infer<
  typeof saveYoutubeKeywordsSchema
>;
export type GetSavedYoutubeKeywordsInput = z.infer<
  typeof getSavedYoutubeKeywordsSchema
>;
export type RemoveSavedYoutubeKeywordsInput = z.infer<
  typeof removeSavedYoutubeKeywordsSchema
>;
export type YoutubeSearchParams = z.infer<typeof youtubeSearchSchema>;

type ResolvedMarket = { locationCode: number; languageCode: string };
export type ResolvedResearchYoutubeKeywordsInput = Omit<
  ResearchYoutubeKeywordsInput,
  keyof ResolvedMarket
> &
  ResolvedMarket;
export type ResolvedGetYoutubeVideosInput = Omit<
  GetYoutubeVideosInput,
  keyof ResolvedMarket
> &
  ResolvedMarket;
export type ResolvedSaveYoutubeKeywordsInput = Omit<
  SaveYoutubeKeywordsInput,
  keyof ResolvedMarket
> &
  ResolvedMarket;
