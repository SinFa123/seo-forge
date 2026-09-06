import { sort } from "remeda";
import { YOUTUBE_SCORING, type YoutubeVideoRow } from "./youtube";

// SEO Forge: the Channels sub-tab is derived from the videos that rank for a
// keyword, so it costs nothing extra. One row per distinct channel, with the
// views its ranking videos gathered and whether it "broke out" on this
// keyword (see YOUTUBE_SCORING.BREAKOUT). Pure so the UI and MCP agree.

export type YoutubeChannelRow = {
  channelId: string;
  channelName: string;
  channelUrl: string | null;
  channelLogoUrl: string | null;
  subscribersCount: number | null;
  /** Views summed over the channel's videos in the results. */
  viewsCount: number;
  /** How many of the ranking videos belong to the channel. */
  videoCount: number;
  bestRank: number;
  /** Highest channel multiplier among the channel's ranking videos. */
  maxChannelMultiplier: number | null;
  breakout: boolean;
};

function isBreakout(input: {
  subscribersCount: number | null;
  maxChannelMultiplier: number | null;
  maxVideoViews: number;
}): boolean {
  const { maxSubscribers, channelMultiplier, viewsPerSubscriber } =
    YOUTUBE_SCORING.BREAKOUT;
  if (input.subscribersCount == null || input.subscribersCount <= 0) {
    return false;
  }
  if (input.subscribersCount > maxSubscribers) return false;
  if (input.maxChannelMultiplier != null) {
    return input.maxChannelMultiplier >= channelMultiplier;
  }
  return input.maxVideoViews >= input.subscribersCount * viewsPerSubscriber;
}

/** Distinct channels behind the ranking videos, most viewed first. */
export function summarizeYoutubeChannels(
  videos: readonly YoutubeVideoRow[],
): YoutubeChannelRow[] {
  const byChannel = new Map<
    string,
    YoutubeChannelRow & { maxVideoViews: number }
  >();
  for (const video of videos) {
    if (!video.channelId) continue;
    const existing = byChannel.get(video.channelId);
    const views = video.viewsCount ?? 0;
    if (!existing) {
      byChannel.set(video.channelId, {
        channelId: video.channelId,
        channelName: video.channelName ?? video.channelId,
        channelUrl: video.channelUrl,
        channelLogoUrl: video.channelLogoUrl,
        subscribersCount: video.subscribersCount,
        viewsCount: views,
        videoCount: 1,
        bestRank: video.rank,
        maxChannelMultiplier: video.channelMultiplier,
        maxVideoViews: views,
        breakout: false,
      });
      continue;
    }
    existing.viewsCount += views;
    existing.videoCount += 1;
    existing.bestRank = Math.min(existing.bestRank, video.rank);
    existing.maxVideoViews = Math.max(existing.maxVideoViews, views);
    existing.subscribersCount ??= video.subscribersCount;
    existing.channelLogoUrl ??= video.channelLogoUrl;
    existing.channelUrl ??= video.channelUrl;
    if (video.channelMultiplier != null) {
      existing.maxChannelMultiplier = Math.max(
        existing.maxChannelMultiplier ?? 0,
        video.channelMultiplier,
      );
    }
  }
  return sort(
    [...byChannel.values()].map(({ maxVideoViews, ...channel }) => ({
      ...channel,
      breakout: isBreakout({ ...channel, maxVideoViews }),
    })),
    (a, b) => b.viewsCount - a.viewsCount,
  );
}
