import { z } from "zod";
import { buildCacheKey, setCached } from "@/server/lib/r2-cache";
import type {
  YoutubeSerpItem,
  YoutubeVideoInfoItem,
} from "@/server/lib/dataforseo/youtube";
import {
  type CompetitionVideoInput,
  type YoutubeVideoRow,
  computeViewsPerHour,
  parseRelativePublicationDate,
} from "@/shared/youtube";
import {
  YOUTUBE_CACHE_NAMESPACE,
  YOUTUBE_CACHE_TTL,
  readCached,
} from "./cache";
import { parseDataforseoTimestamp } from "./helpers";
import type { DataforseoClient } from "./volume";

// SEO Forge: per-video detail from DataForSEO video info (3x the SERP price),
// cached 24 hours per video and market so the keyword research (seed
// competition, views per hour) and the Videos tab share one paid call.

const videoInfoSnapshotSchema = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
  url: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  channelUrl: z.string().nullable(),
  channelLogoUrl: z.string().nullable().default(null),
  /** Exact publish time as ISO-8601 (video info `timestamp`). */
  publishedAt: z.string().nullable(),
  viewsCount: z.number().nullable(),
  likesCount: z.number().nullable(),
  commentsCount: z.number().nullable(),
  durationSeconds: z.number().nullable(),
  subscribersCount: z.number().nullable(),
  isLive: z.boolean(),
});

type VideoInfoSnapshot = z.infer<typeof videoInfoSnapshotSchema>;

// A video DataForSEO cannot resolve is cached as `info: null` so the miss is
// not re-bought on every research run within the TTL.
const cachedVideoInfoSchema = z.object({
  info: videoInfoSnapshotSchema.nullable(),
});

function toVideoInfoSnapshot(
  videoId: string,
  item: YoutubeVideoInfoItem,
): VideoInfoSnapshot {
  return {
    videoId,
    title: item.title ?? null,
    url: item.url ?? null,
    thumbnailUrl: item.thumbnail_url ?? null,
    channelId: item.channel_id ?? null,
    channelName: item.channel_name ?? null,
    channelUrl: item.channel_url ?? null,
    channelLogoUrl: item.channel_logo ?? null,
    publishedAt: parseDataforseoTimestamp(item.timestamp),
    viewsCount: item.views_count ?? null,
    likesCount: item.likes_count ?? null,
    commentsCount: item.comments_count ?? null,
    durationSeconds: item.duration_time_seconds ?? null,
    subscribersCount: item.channel_subscribers_count?.count ?? null,
    isLive: item.is_live ?? false,
  };
}

export async function getVideoInfo(
  client: DataforseoClient,
  input: { videoId: string; locationCode: number; languageCode: string },
): Promise<{ info: VideoInfoSnapshot | null; fetched: boolean }> {
  const cacheKey = await buildCacheKey(YOUTUBE_CACHE_NAMESPACE.videoInfo, {
    videoId: input.videoId,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
  });
  const cached = await readCached(cacheKey, cachedVideoInfoSchema);
  if (cached) return { info: cached.info, fetched: false };

  const item = await client.youtube.videoInfo(input);
  const info = item ? toVideoInfoSnapshot(input.videoId, item) : null;
  await setCached(cacheKey, { info }, YOUTUBE_CACHE_TTL.videoInfo);
  return { info, fetched: true };
}

/**
 * One Videos-tab row from a SERP item and (when bought) its video info. The
 * exact publish time only exists in video info, so views per hour is null
 * without it; the SERP's relative label is kept for display either way. The
 * channel multiplier is filled in by the videos orchestration.
 */
function pickChannel(item: YoutubeSerpItem, info: VideoInfoSnapshot | null) {
  return {
    channelId: item.channel_id ?? info?.channelId ?? null,
    channelName: item.channel_name ?? info?.channelName ?? null,
    channelUrl: item.channel_url ?? info?.channelUrl ?? null,
    channelLogoUrl: item.channel_logo ?? info?.channelLogoUrl ?? null,
  };
}

export function buildVideoRow(
  rank: number,
  item: YoutubeSerpItem,
  info: VideoInfoSnapshot | null,
  now: Date,
): YoutubeVideoRow {
  const videoId = item.video_id ?? "";
  const viewsCount = info?.viewsCount ?? item.views_count ?? null;
  const publishedAt = info?.publishedAt ?? null;
  return {
    rank,
    videoId,
    title: info?.title ?? item.title ?? "",
    url: info?.url ?? item.url ?? `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: item.thumbnail_url ?? info?.thumbnailUrl ?? null,
    ...pickChannel(item, info),
    publishedAt,
    publishedLabel: item.publication_date ?? null,
    viewsCount,
    likesCount: info?.likesCount ?? null,
    commentsCount: info?.commentsCount ?? null,
    durationSeconds:
      item.duration_time_seconds ?? info?.durationSeconds ?? null,
    isShorts: item.is_shorts ?? false,
    isLive: item.is_live ?? info?.isLive ?? false,
    viewsPerHour: computeViewsPerHour(viewsCount, publishedAt, now),
    subscribersCount: info?.subscribersCount ?? null,
    channelMultiplier: null,
  };
}

/**
 * Competition input for a ranked video. Falls back to the SERP's relative
 * publish label when no exact time is known, which is all the freshness
 * bucket needs.
 */
export function toCompetitionInput(
  row: YoutubeVideoRow,
  now: Date,
): CompetitionVideoInput {
  return {
    viewsCount: row.viewsCount,
    subscribersCount: row.subscribersCount,
    publishedAt:
      row.publishedAt ?? parseRelativePublicationDate(row.publishedLabel, now),
    isShorts: row.isShorts,
    channelId: row.channelId,
  };
}
