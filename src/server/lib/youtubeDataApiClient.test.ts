import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOptionalEnvValueMock } = vi.hoisted(() => ({
  getOptionalEnvValueMock:
    vi.fn<(name: string) => Promise<string | undefined>>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: getOptionalEnvValueMock,
}));

import { getChannelRecentUploads } from "@/server/lib/youtubeDataApiClient";

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

describe("getChannelRecentUploads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getOptionalEnvValueMock.mockResolvedValue("test-key");
  });

  it("reports not_configured without calling the API when the key is unset", async () => {
    getOptionalEnvValueMock.mockResolvedValue(undefined);
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getChannelRecentUploads("UC1")).resolves.toEqual({
      status: "not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("walks channel -> uploads playlist -> video statistics and returns view counts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: "UC1",
              contentDetails: { relatedPlaylists: { uploads: "UU1" } },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            { contentDetails: { videoId: "v1" } },
            { contentDetails: { videoId: "v2" } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          items: [
            {
              id: "v1",
              statistics: { viewCount: "1200" },
              snippet: { publishedAt: "2026-08-01T00:00:00Z" },
            },
            // A video with hidden statistics must be skipped, not counted as 0.
            { id: "v2", statistics: {} },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelRecentUploads("UC1", { limit: 2 });

    const calledUrls = fetchMock.mock.calls.map(([url]) => requestUrl(url));
    expect(calledUrls.map((url) => url.pathname)).toEqual([
      "/youtube/v3/channels",
      "/youtube/v3/playlistItems",
      "/youtube/v3/videos",
    ]);
    expect(calledUrls[1]?.searchParams.get("playlistId")).toBe("UU1");
    expect(calledUrls[1]?.searchParams.get("maxResults")).toBe("2");
    expect(calledUrls[2]?.searchParams.get("id")).toBe("v1,v2");
    expect(
      calledUrls.every((url) => url.searchParams.get("key") === "test-key"),
    ).toBe(true);
    expect(result).toEqual({
      status: "ok",
      data: {
        channelId: "UC1",
        uploads: [
          {
            videoId: "v1",
            viewCount: 1200,
            publishedAt: "2026-08-01T00:00:00Z",
          },
        ],
      },
    });
  });

  it("returns an error result without leaking the request URL when the API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("quota", { status: 403 })),
    );

    const result = await getChannelRecentUploads("UC1");

    expect(result).toEqual({
      status: "error",
      message: "YouTube Data API channels failed: HTTP 403",
    });
  });
});
