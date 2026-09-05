import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { YOUTUBE_SCORING } from "@/shared/youtube";

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(async () => {}),
  fetchYoutubeSuggestions: vi.fn(),
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

vi.mock("@/server/lib/youtubeAutocompleteClient", () => ({
  fetchYoutubeSuggestions: mocks.fetchYoutubeSuggestions,
}));

import { research } from "./research";
import type { DataforseoClient } from "./volume";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "alice@example.com",
};

const input = {
  projectId: "proj_1",
  keyword: " Bake Bread ",
  locationCode: 2840,
  languageCode: "en",
  serpRowLimit: 2,
};

function serpItem(videoId: string, channelId = `chan_${videoId}`) {
  return {
    type: "youtube_video",
    video_id: videoId,
    title: `Video ${videoId}`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    channel_id: channelId,
    views_count: 50_000,
    publication_date: "1 year ago",
    is_shorts: false,
  };
}

function mockClient() {
  const serp = vi.fn<DataforseoClient["youtube"]["serp"]>(async () => [
    serpItem("a"),
    serpItem("b"),
  ]);
  const videoInfo = vi.fn<DataforseoClient["youtube"]["videoInfo"]>(
    async ({ videoId }) => ({
      type: "youtube_video_info",
      video_id: videoId,
      views_count: 100_000,
      timestamp: "2026-08-06 12:00:00 +00:00",
      channel_subscribers_count: { count: 20_000 },
    }),
  );
  const explore = vi.fn<DataforseoClient["trends"]["explore"]>(
    async ({ keywords }) =>
      keywords.length === 1
        ? {
            graph: null,
            queries: {
              top: [{ query: "sourdough bread", value: 100 }],
              rising: [{ query: "bake bread at home", value: 5000 }],
            },
          }
        : {
            graph: {
              keywords,
              points: [{ values: [50, 100] }],
            },
            queries: null,
          },
  );
  const adsSearchVolume = vi.fn<
    DataforseoClient["keywords"]["adsSearchVolume"]
  >(async () => [
    { keyword: "bake bread", search_volume: 100_000 },
    { keyword: "sourdough bread", search_volume: 40_000 },
    { keyword: "bake bread at home", search_volume: 1_000 },
    // "how to bake bread" is deliberately missing => no anchor
  ]);
  mocks.createDataforseoClient.mockReturnValue({
    youtube: { serp, videoInfo },
    trends: { explore },
    keywords: { adsSearchVolume },
  });
  return { serp, videoInfo, explore, adsSearchVolume };
}

describe("youtube research", () => {
  beforeEach(() => {
    // Video info publishes 30 days before "now" so views per hour is exact.
    vi.setSystemTime(new Date("2026-09-05T12:00:00.000Z"));
    mocks.getCached.mockResolvedValue(null);
    mocks.fetchYoutubeSuggestions.mockImplementation(
      async ({ term }: { term: string }) =>
        term === "bake bread"
          ? ["how to bake bread", "bake bread at home"]
          : [],
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("scores the seed and candidates, buys one SERP per row up to the limit, and caches the result", async () => {
    const client = mockClient();

    const result = await research(input, billingCustomer);

    // Section 4 call budget: seed SERP + serpRowLimit row SERPs, video info per
    // seed result, two Trends requests, one bulk Ads call, 36 suggest calls.
    expect(result.diagnostics.apiCalls).toEqual({
      youtubeSerp: 1 + 2,
      videoInfo: 2,
      trends: 2,
      adsSearchVolume: 1,
      suggest: 36,
    });
    expect(client.serp).toHaveBeenCalledTimes(3);
    expect(client.adsSearchVolume.mock.calls[0]?.[0].keywords).toEqual([
      "bake bread",
      "how to bake bread",
      "bake bread at home",
      "sourdough bread",
    ]);

    // Seed: share = (50/100) * 300k / 100k = 1.5 => 150k, high confidence,
    // competition from video info (subscribers present).
    expect(result.seed).toMatchObject({
      keyword: "bake bread",
      kind: "seed",
      searchVolume: 150_000,
      volumeConfidence: "high",
      wordCount: 2,
      videoCount: 2,
    });
    expect(result.seed.competition).not.toBeNull();
    expect(result.seed.medianViewsPerHour).toBeCloseTo(100_000 / (30 * 24), 3);

    // Candidates ranked by anchor; the top two received a SERP, the unanchored
    // one is low confidence with no volume and no SERP.
    const candidateShare =
      YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE +
      (1.5 - YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE) *
        YOUTUBE_SCORING.CANDIDATE_SHARE_DAMPING;
    expect(result.rows.map((row) => row.keyword)).toEqual([
      "sourdough bread",
      "bake bread at home",
      "how to bake bread",
    ]);
    expect(result.rows[0]).toMatchObject({
      kind: "related",
      searchVolume: Math.round(40_000 * candidateShare),
      volumeConfidence: "medium",
    });
    expect(result.rows[0]?.competition).not.toBeNull();
    expect(result.rows[1]).toMatchObject({ kind: "matching" });
    expect(result.rows[2]).toEqual({
      keyword: "how to bake bread",
      kind: "question",
      searchVolume: null,
      volumeConfidence: "low",
      competition: null,
      overallScore: null,
      wordCount: 4,
    });

    expect(mocks.setCached).toHaveBeenCalledWith(
      expect.stringContaining("youtube:research"),
      result,
      24 * 60 * 60,
    );
  });

  it("returns the cached result without any provider call", async () => {
    const client = mockClient();
    const cached = {
      seed: {
        keyword: "bake bread",
        kind: "seed",
        searchVolume: 1,
        volumeConfidence: "high",
        competition: 1,
        overallScore: 1,
        wordCount: 2,
        medianViewsPerHour: null,
        videoCount: 0,
      },
      rows: [],
      diagnostics: {
        candidateCount: 0,
        suggestionCount: 0,
        trendsRelatedCount: 0,
        anchoredCount: 0,
        serpRowCount: 0,
        seedInterest: null,
        benchmarkInterest: null,
        seedYoutubeShare: null,
        apiCalls: {
          youtubeSerp: 0,
          videoInfo: 0,
          trends: 0,
          adsSearchVolume: 0,
          suggest: 0,
        },
      },
      fetchedAt: "2026-09-05T00:00:00.000Z",
    };
    mocks.getCached.mockResolvedValue(cached);

    await expect(research(input, billingCustomer)).resolves.toEqual(cached);
    expect(client.serp).not.toHaveBeenCalled();
    expect(mocks.fetchYoutubeSuggestions).not.toHaveBeenCalled();
  });

  it("falls back to medium confidence for the seed when Trends has no signal", async () => {
    const client = mockClient();
    client.explore.mockImplementation(async ({ keywords }) => ({
      graph: { keywords, points: [{ values: keywords.map(() => 0) }] },
      queries: null,
    }));

    const result = await research(input, billingCustomer);

    expect(result.seed).toMatchObject({
      searchVolume: 100_000 * YOUTUBE_SCORING.DEFAULT_YOUTUBE_SHARE,
      volumeConfidence: "medium",
    });
    expect(result.diagnostics.seedYoutubeShare).toBeNull();
  });
});
