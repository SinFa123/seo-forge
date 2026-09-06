import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(async () => {}),
  getOptionalEnvValue: vi.fn(),
  getChannelRecentUploads: vi.fn(),
}));

vi.mock("@/server/lib/r2-cache", () => ({
  buildCacheKey: vi.fn(
    async (prefix: string, params: Record<string, unknown>) =>
      `${prefix}:${JSON.stringify(params)}`,
  ),
  getCached: mocks.getCached,
  setCached: mocks.setCached,
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));

vi.mock("@/server/lib/youtubeDataApiClient", () => ({
  YOUTUBE_DATA_API_KEY_ENV: "YOUTUBE_DATA_API_KEY",
  getChannelRecentUploads: mocks.getChannelRecentUploads,
}));

import { YOUTUBE_CACHE_TTL } from "./cache";
import { getVideos } from "./videos";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "alice@example.com",
};

const input = {
  projectId: "proj_1",
  keyword: "bake bread",
  locationCode: 2840,
  languageCode: "en",
  depth: 20,
  refresh: false,
};

function mockClient() {
  const serp = vi.fn(async () => [
    {
      type: "youtube_video",
      video_id: "top",
      title: "Top video",
      channel_id: "chan_1",
      channel_name: "Baker",
      views_count: 1_000_000,
      publication_date: "2 months ago",
      is_shorts: false,
    },
    {
      type: "youtube_video",
      video_id: "other",
      title: "Other video",
      channel_id: "chan_2",
      views_count: 500,
      publication_date: "1 week ago",
      is_shorts: true,
    },
  ]);
  const videoInfo = vi.fn(async ({ videoId }: { videoId: string }) => ({
    type: "youtube_video_info",
    video_id: videoId,
    views_count: videoId === "top" ? 1_000_000 : 500,
    timestamp: "2026-08-26 12:00:00 +00:00",
    channel_subscribers_count: { count: 1000 },
  }));
  mocks.createDataforseoClient.mockReturnValue({
    youtube: { serp, videoInfo },
  });
  return { serp, videoInfo };
}

describe("youtube videos", () => {
  beforeEach(() => {
    mocks.getCached.mockResolvedValue(null);
    mocks.getOptionalEnvValue.mockResolvedValue("data-api-key");
  });

  it("computes views per hour and the channel multiplier excluding the ranked video", async () => {
    mockClient();
    mocks.getChannelRecentUploads.mockImplementation(
      async (channelId: string) => ({
        status: "ok",
        data: {
          channelId,
          uploads: [
            { videoId: "top", viewCount: 1_000_000, publishedAt: null },
            ...[1, 2, 3, 4, 5].map((n) => ({
              videoId: `${channelId}_${n}`,
              viewCount: 10_000 * n,
              publishedAt: null,
            })),
          ],
        },
      }),
    );

    const result = await getVideos(input, billingCustomer);

    expect(result.dataApiStatus).toBe("ok");
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      rank: 1,
      videoId: "top",
      channelName: "Baker",
      viewsCount: 1_000_000,
      subscribersCount: 1000,
      publishedAt: "2026-08-26T12:00:00.000Z",
      publishedLabel: "2 months ago",
      // median of the other five uploads is 30k => 33.3x
      channelMultiplier: 1_000_000 / 30_000,
    });
    expect(result.rows[0]?.viewsPerHour).toBeGreaterThan(0);
    expect(result.rows[1]).toMatchObject({ isShorts: true, rank: 2 });
    expect(mocks.getChannelRecentUploads).toHaveBeenCalledTimes(2);
    expect(mocks.setCached).toHaveBeenCalledWith(
      expect.stringContaining("youtube:channel-stats"),
      expect.anything(),
      YOUTUBE_CACHE_TTL.channelStats,
    );
    expect(mocks.setCached).toHaveBeenCalledWith(
      expect.stringContaining("youtube:videos"),
      result,
      YOUTUBE_CACHE_TTL.videos,
    );
  });

  it("skips the Data API and reports not_configured when the key is unset", async () => {
    mockClient();
    mocks.getOptionalEnvValue.mockResolvedValue(undefined);

    const result = await getVideos(input, billingCustomer);

    expect(result.dataApiStatus).toBe("not_configured");
    expect(result.rows.every((row) => row.channelMultiplier === null)).toBe(
      true,
    );
    expect(mocks.getChannelRecentUploads).not.toHaveBeenCalled();
    expect(mocks.setCached).toHaveBeenCalledWith(
      expect.stringContaining('"dataApiConfigured":false'),
      result,
      YOUTUBE_CACHE_TTL.videos,
    );
  });

  it("reports error when every channel lookup fails and leaves multipliers null", async () => {
    mockClient();
    mocks.getChannelRecentUploads.mockResolvedValue({
      status: "error",
      message: "HTTP 403",
    });

    const result = await getVideos(input, billingCustomer);

    expect(result.dataApiStatus).toBe("error");
    expect(result.rows[0]?.channelMultiplier).toBeNull();
    expect(mocks.setCached).not.toHaveBeenCalledWith(
      expect.stringContaining("youtube:channel-stats"),
      expect.anything(),
      expect.anything(),
    );
  });
});
