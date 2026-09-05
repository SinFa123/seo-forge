import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
} from "@/server/lib/dataforseo/envelope";

// YouTube SERP API. Two live endpoints back the YouTube Research feature:
// organic search (one page of `block_depth` videos for a keyword, billed per
// 20 results) and video info (per-video metrics incl. the channel's subscriber
// count, billed at 3x the SERP price). Neither carries search volume — YouTube
// publishes none — so volume is estimated elsewhere (see
// src/server/features/youtube/services/research/volume.ts).

/** Default page size. DataForSEO bills YouTube organic per 20 results. */
const YOUTUBE_SERP_DEFAULT_DEPTH = 20;
const YOUTUBE_SERP_MIN_DEPTH = 20;
const YOUTUBE_SERP_MAX_DEPTH = 200;

/** DataForSEO accepts block_depth 20-200; each 20 is another billed page. */
function clampBlockDepth(depth: number): number {
  return Math.min(
    YOUTUBE_SERP_MAX_DEPTH,
    Math.max(YOUTUBE_SERP_MIN_DEPTH, depth),
  );
}

// Hand-written schema: only the fields the feature acts on are validated;
// unknown keys pass through so future DataForSEO additions don't break parsing.
const youtubeSerpItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    video_id: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    channel_id: z.string().nullable().optional(),
    channel_name: z.string().nullable().optional(),
    channel_url: z.string().nullable().optional(),
    channel_logo: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    badges: z.array(z.string()).nullable().optional(),
    publication_date: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    duration_time: z.string().nullable().optional(),
    duration_time_seconds: z.number().nullable().optional(),
    views_count: z.number().nullable().optional(),
    is_live: z.boolean().nullable().optional(),
    is_shorts: z.boolean().nullable().optional(),
    is_movie: z.boolean().nullable().optional(),
  })
  .passthrough();

export type YoutubeSerpItem = z.infer<typeof youtubeSerpItemSchema>;

export async function fetchYoutubeSerp(input: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  /** Number of results (20-200). Defaults to one billed page of 20. */
  depth?: number;
}): Promise<DataforseoApiResponse<YoutubeSerpItem[]>> {
  const response = await dataforseoPost<DataforseoItemsTask<YoutubeSerpItem>>(
    "/v3/serp/youtube/organic/live/advanced",
    [
      {
        keyword: input.keyword,
        location_code: input.locationCode,
        language_code: input.languageCode,
        device: "desktop",
        os: "windows",
        block_depth: clampBlockDepth(input.depth ?? YOUTUBE_SERP_DEFAULT_DEPTH),
      },
    ],
  );
  // A valid empty SERP arrives as a "No Search Results" task error; keep the
  // charged response in the normal billing path and return no items.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems(
    "youtube-organic-live-advanced",
    task,
    youtubeSerpItemSchema,
  );
  return {
    // Only entries that are actual videos are useful downstream; block
    // headers or other element types have no video_id.
    data: items.filter((item) => item.video_id != null),
    billing: buildTaskBilling(task),
  };
}

const youtubeVideoInfoItemSchema = z
  .object({
    type: z.string(),
    video_id: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    thumbnail_url: z.string().nullable().optional(),
    channel_id: z.string().nullable().optional(),
    channel_name: z.string().nullable().optional(),
    channel_url: z.string().nullable().optional(),
    channel_logo: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    views_count: z.number().nullable().optional(),
    likes_count: z.number().nullable().optional(),
    comments_count: z.number().nullable().optional(),
    publication_date: z.string().nullable().optional(),
    timestamp: z.string().nullable().optional(),
    duration_time: z.string().nullable().optional(),
    duration_time_seconds: z.number().nullable().optional(),
    is_live: z.boolean().nullable().optional(),
    is_embeddable: z.boolean().nullable().optional(),
    category: z.string().nullable().optional(),
    keywords: z.array(z.string()).nullable().optional(),
    channel_subscribers_count: z
      .object({
        displayed_count: z.string().nullable().optional(),
        count: z.number().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export type YoutubeVideoInfoItem = z.infer<typeof youtubeVideoInfoItemSchema>;

export async function fetchYoutubeVideoInfo(input: {
  videoId: string;
  locationCode: number;
  languageCode: string;
}): Promise<DataforseoApiResponse<YoutubeVideoInfoItem | null>> {
  const response = await dataforseoPost<
    DataforseoItemsTask<YoutubeVideoInfoItem>
  >("/v3/serp/youtube/video_info/live/advanced", [
    {
      video_id: input.videoId,
      location_code: input.locationCode,
      language_code: input.languageCode,
      // Video info is desktop-only at DataForSEO.
      device: "desktop",
      os: "windows",
    },
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const items = parseTaskItems(
    "youtube-video-info-live-advanced",
    task,
    youtubeVideoInfoItemSchema,
  );
  return {
    data: items[0] ?? null,
    billing: buildTaskBilling(task),
  };
}
