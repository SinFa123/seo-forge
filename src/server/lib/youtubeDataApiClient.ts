import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// YouTube Data API v3, used for the one thing DataForSEO cannot provide: a
// channel's recent uploads, which the Videos tab needs for the channel-relative
// multiplier ("this video has 35x the channel's median views"). Public data
// only, so a plain API key suffices — no OAuth, and no touch on upstream's
// Google OAuth integration. The key is optional: when unset the feature reports
// `not_configured` and the UI shows a setup hint instead of the multiplier.
//
// Quota (verified against Google's docs 2026-09-05): 10,000 units/day by
// default; channels.list, playlistItems.list and videos.list cost 1 unit each,
// so one channel lookup is 3 units. search.list (100 units, separately capped)
// is deliberately not used.

export const YOUTUBE_DATA_API_KEY_ENV = "YOUTUBE_DATA_API_KEY";
/** Recent uploads sampled per channel. The uploads playlist is newest-first. */
const CHANNEL_UPLOAD_SAMPLE_SIZE = 20;
const API_BASE = "https://www.googleapis.com/youtube/v3";
const REQUEST_TIMEOUT_MS = 10_000;

type ChannelUpload = {
  videoId: string;
  viewCount: number;
  publishedAt: string | null;
};

type ChannelRecentUploads = {
  channelId: string;
  uploads: ChannelUpload[];
};

type YoutubeDataApiResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  | { status: "error"; message: string };

const googleErrorSchema = z.object({
  error: z.object({ message: z.string() }),
});

const channelsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        contentDetails: z
          .object({
            relatedPlaylists: z
              .object({ uploads: z.string().optional() })
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const playlistItemsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        contentDetails: z.object({
          videoId: z.string(),
          videoPublishedAt: z.string().optional(),
        }),
      }),
    )
    .optional(),
});

const videosResponseSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        statistics: z.object({ viewCount: z.string().optional() }).optional(),
        snippet: z.object({ publishedAt: z.string().optional() }).optional(),
      }),
    )
    .optional(),
});

async function apiGet<T extends z.ZodTypeAny>(
  resource: string,
  params: Record<string, string>,
  apiKey: string,
  schema: T,
): Promise<z.infer<T>> {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(`${API_BASE}/${resource}?${query.toString()}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    // Never include the URL (it carries the key) in surfaced messages; Google's
    // own reason ("API key not valid", "blocked", quota) is what an operator
    // needs to fix the key.
    const reason = googleErrorSchema.safeParse(
      await response.json().catch(() => null),
    );
    const detail = reason.success ? `: ${reason.data.error.message}` : "";
    throw new Error(
      `YouTube Data API ${resource} failed: HTTP ${response.status}${detail}`,
    );
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error(
      `YouTube Data API ${resource} returned an unexpected shape`,
    );
  }
  return parsed.data;
}

export async function getChannelRecentUploads(
  channelId: string,
  options: { limit?: number } = {},
): Promise<YoutubeDataApiResult<ChannelRecentUploads>> {
  const apiKey = await getOptionalEnvValue(YOUTUBE_DATA_API_KEY_ENV);
  if (!apiKey) return { status: "not_configured" };

  const limit = Math.min(
    50,
    Math.max(1, options.limit ?? CHANNEL_UPLOAD_SAMPLE_SIZE),
  );
  try {
    const channels = await apiGet(
      "channels",
      { part: "contentDetails", id: channelId },
      apiKey,
      channelsResponseSchema,
    );
    const uploadsPlaylistId =
      channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return { status: "ok", data: { channelId, uploads: [] } };
    }

    const playlist = await apiGet(
      "playlistItems",
      {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: String(limit),
      },
      apiKey,
      playlistItemsResponseSchema,
    );
    const videoIds = (playlist.items ?? []).map(
      (item) => item.contentDetails.videoId,
    );
    if (videoIds.length === 0) {
      return { status: "ok", data: { channelId, uploads: [] } };
    }

    const videos = await apiGet(
      "videos",
      { part: "statistics,snippet", id: videoIds.join(",") },
      apiKey,
      videosResponseSchema,
    );
    const uploads: ChannelUpload[] = [];
    for (const video of videos.items ?? []) {
      const viewCount = Number(video.statistics?.viewCount);
      if (!Number.isFinite(viewCount)) continue;
      uploads.push({
        videoId: video.id,
        viewCount,
        publishedAt: video.snippet?.publishedAt ?? null,
      });
    }
    return { status: "ok", data: { channelId, uploads } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("youtube-data-api.failed", { channelId, message });
    return { status: "error", message };
  }
}
