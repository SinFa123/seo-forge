import { describe, expect, it } from "vitest";
import type { YoutubeVideoRow } from "./youtube";
import { summarizeYoutubeChannels } from "./youtube-channels";

function video(
  rank: number,
  channelId: string,
  viewsCount: number,
  extra: Partial<YoutubeVideoRow> = {},
): YoutubeVideoRow {
  return {
    rank,
    videoId: `v${rank}`,
    title: `Video ${rank}`,
    url: `https://www.youtube.com/watch?v=v${rank}`,
    thumbnailUrl: null,
    channelId,
    channelName: `Channel ${channelId}`,
    channelUrl: null,
    channelLogoUrl: null,
    publishedAt: null,
    publishedLabel: null,
    viewsCount,
    likesCount: null,
    commentsCount: null,
    durationSeconds: null,
    isShorts: false,
    isLive: false,
    viewsPerHour: null,
    subscribersCount: null,
    channelMultiplier: null,
    ...extra,
  };
}

describe("summarizeYoutubeChannels", () => {
  it("groups ranking videos per channel, sums views, keeps the best rank, and sorts by views", () => {
    const channels = summarizeYoutubeChannels([
      video(1, "a", 1000, { subscribersCount: 50_000 }),
      video(2, "b", 5000),
      video(3, "a", 2000, { channelMultiplier: 1.2 }),
      video(4, "", 999),
    ]);

    expect(channels.map((c) => c.channelId)).toEqual(["b", "a"]);
    expect(channels[1]).toMatchObject({
      viewsCount: 3000,
      videoCount: 2,
      bestRank: 1,
      subscribersCount: 50_000,
      maxChannelMultiplier: 1.2,
      breakout: false,
    });
  });

  it("flags breakout only for small channels: by channel multiplier when available, else by views against subscribers", () => {
    const channels = summarizeYoutubeChannels([
      video(1, "small-hit", 100, {
        channelMultiplier: 12,
        subscribersCount: 200_000,
      }),
      video(2, "big-hit", 100, {
        channelMultiplier: 200,
        subscribersCount: 4_000_000,
      }),
      video(3, "small-normal", 100, {
        channelMultiplier: 2,
        subscribersCount: 200_000,
      }),
      video(4, "small-no-api", 60_000, { subscribersCount: 10_000 }),
      video(5, "mid-no-api", 20_000, { subscribersCount: 400_000 }),
      video(6, "unknown-subs", 20_000),
    ]);

    expect(
      Object.fromEntries(channels.map((c) => [c.channelId, c.breakout])),
    ).toEqual({
      "small-hit": true,
      "big-hit": false,
      "small-normal": false,
      "small-no-api": true,
      "mid-no-api": false,
      "unknown-subs": false,
    });
  });
});
