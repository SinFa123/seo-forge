import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import {
  fetchYoutubeSerp,
  fetchYoutubeVideoInfo,
} from "@/server/lib/dataforseo/youtube";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

function serpTask(items: unknown[]) {
  return {
    status_code: 20000,
    tasks: [
      {
        status_code: 20000,
        path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
        cost: 0.002,
        result_count: 1,
        result: [{ items }],
      },
    ],
  };
}

describe("fetchYoutubeSerp", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the keyword with a clamped block_depth and keeps only video items", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        serpTask([
          {
            type: "youtube_video",
            rank_group: 1,
            rank_absolute: 1,
            video_id: "abc123",
            title: "How to bake bread",
            url: "https://www.youtube.com/watch?v=abc123",
            thumbnail_url: "https://i.ytimg.com/vi/abc123/hq720.jpg",
            channel_id: "UC1",
            channel_name: "Baker",
            channel_url: "https://www.youtube.com/@baker",
            badges: ["4K"],
            publication_date: "2 years ago",
            timestamp: "2024-01-15 10:00:00 +00:00",
            duration_time: "12:34",
            duration_time_seconds: 754,
            views_count: 1_250_000,
            is_live: false,
            is_shorts: false,
            is_movie: false,
            // A field we don't model must survive parsing.
            highlighted: ["bread"],
          },
          { type: "youtube_shelf", title: "Shorts" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeSerp({
      keyword: "how to bake bread",
      locationCode: 2840,
      languageCode: "en",
      depth: 7,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      expect.stringContaining("/v3/serp/youtube/organic/live/advanced"),
    );
    expect(parseDataforseoRequestBody(init)).toEqual([
      {
        keyword: "how to bake bread",
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        os: "windows",
        block_depth: 20,
      },
    ]);
    expect(result.billing).toEqual({
      path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
      costUsd: 0.002,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      video_id: "abc123",
      views_count: 1_250_000,
      is_shorts: false,
    });
  });

  it("returns an empty result for DataForSEO's no-results task", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 40102,
              status_message: "No Search Results.",
              path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
              cost: 0.002,
              result_count: 0,
              result: [],
            },
          ],
        }),
      ),
    );

    await expect(
      fetchYoutubeSerp({
        keyword: "zzqxv nonsense",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).resolves.toEqual({
      data: [],
      billing: {
        path: ["v3", "serp", "youtube", "organic", "live", "advanced"],
        costUsd: 0.002,
      },
    });
  });
});

describe("fetchYoutubeVideoInfo", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the video id and returns the single info item with subscriber count", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: ["v3", "serp", "youtube", "video_info", "live", "advanced"],
            cost: 0.006,
            result_count: 1,
            result: [
              {
                items: [
                  {
                    type: "youtube_video_info",
                    video_id: "abc123",
                    title: "How to bake bread",
                    views_count: 1_250_000,
                    likes_count: 40_000,
                    comments_count: 1_200,
                    timestamp: "2024-01-15 10:00:00 +00:00",
                    duration_time_seconds: 754,
                    keywords: ["bread", "baking"],
                    channel_subscribers_count: {
                      displayed_count: "2.1M subscribers",
                      count: 2_100_000,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchYoutubeVideoInfo({
      videoId: "abc123",
      locationCode: 2840,
      languageCode: "en",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      expect.stringContaining("/v3/serp/youtube/video_info/live/advanced"),
    );
    expect(parseDataforseoRequestBody(init)).toEqual([
      {
        video_id: "abc123",
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        os: "windows",
      },
    ]);
    expect(result.billing.costUsd).toBe(0.006);
    expect(result.data).toMatchObject({
      video_id: "abc123",
      likes_count: 40_000,
      channel_subscribers_count: { count: 2_100_000 },
    });
  });

  it("returns null data when the video is not found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 40102,
              status_message: "No Search Results.",
              path: ["v3", "serp", "youtube", "video_info", "live", "advanced"],
              cost: 0.006,
              result_count: 0,
              result: [],
            },
          ],
        }),
      ),
    );

    await expect(
      fetchYoutubeVideoInfo({
        videoId: "missing",
        locationCode: 2840,
        languageCode: "en",
      }),
    ).resolves.toMatchObject({ data: null, billing: { costUsd: 0.006 } });
  });
});
