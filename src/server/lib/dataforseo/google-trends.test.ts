import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/runtime-env", () => ({
  getRequiredEnvValue: vi.fn(async () => "test-api-key"),
}));

import { fetchGoogleTrendsExplore } from "@/server/lib/dataforseo/google-trends";

function parseDataforseoRequestBody(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected DataForSEO request body to be a string");
  }
  return JSON.parse(body) as unknown;
}

const PATH = ["v3", "keywords_data", "google_trends", "explore", "live"];

describe("fetchGoogleTrendsExplore", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("omits item_types for multi-keyword requests and maps the graph", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: PATH,
            cost: 0.011,
            result_count: 1,
            result: [
              {
                keywords: ["sourdough", "focaccia"],
                type: "youtube",
                items: [
                  {
                    type: "google_trends_graph",
                    position: 1,
                    title: "Interest over time",
                    keywords: ["sourdough", "focaccia"],
                    data: [
                      {
                        date_from: "2025-09-01",
                        date_to: "2025-09-07",
                        timestamp: 1756684800,
                        missing_data: false,
                        values: [80, 20],
                      },
                      {
                        date_from: "2025-09-08",
                        date_to: "2025-09-14",
                        timestamp: 1757289600,
                        missing_data: false,
                        values: [100, 25],
                      },
                    ],
                  },
                  // An element type we don't model must be ignored, not fatal.
                  { type: "google_trends_map", position: 3, data: [] },
                ],
              },
            ],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchGoogleTrendsExplore({
      keywords: ["sourdough", "focaccia"],
      locationCode: 2840,
      languageCode: "en",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toEqual(
      expect.stringContaining("/v3/keywords_data/google_trends/explore/live"),
    );
    expect(parseDataforseoRequestBody(init)).toEqual([
      {
        keywords: ["sourdough", "focaccia"],
        location_code: 2840,
        language_code: "en",
        type: "youtube",
        time_range: "past_12_months",
      },
    ]);
    expect(result.billing).toEqual({ path: PATH, costUsd: 0.011 });
    expect(result.data.graph).toEqual({
      keywords: ["sourdough", "focaccia"],
      points: [
        expect.objectContaining({ values: [80, 20] }),
        expect.objectContaining({ values: [100, 25] }),
      ],
    });
    expect(result.data.queries).toBeNull();
  });

  it("requests graph + related queries for a single keyword", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            path: PATH,
            cost: 0.011,
            result_count: 1,
            result: [
              {
                keywords: ["sourdough"],
                type: "youtube",
                items: [
                  {
                    type: "google_trends_queries_list",
                    position: 1,
                    title: "Related queries",
                    keywords: ["sourdough"],
                    data: {
                      top: [{ query: "sourdough starter", value: 100 }],
                      rising: [{ query: "sourdough discard", value: 25000 }],
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

    const result = await fetchGoogleTrendsExplore({
      keywords: ["sourdough"],
      locationCode: 2840,
      languageCode: "en",
    });

    expect(parseDataforseoRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual([
      expect.objectContaining({
        keywords: ["sourdough"],
        item_types: ["google_trends_graph", "google_trends_queries_list"],
      }),
    ]);
    expect(result.data.graph).toBeNull();
    expect(result.data.queries).toEqual({
      top: [{ query: "sourdough starter", value: 100 }],
      rising: [{ query: "sourdough discard", value: 25000 }],
    });
  });

  it("returns null graph and queries for a no-data task without dropping billing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 40102,
              status_message: "No Search Results.",
              path: PATH,
              cost: 0.011,
              result_count: 0,
              result: [],
            },
          ],
        }),
      ),
    );

    await expect(
      fetchGoogleTrendsExplore({
        keywords: ["zzqxv nonsense"],
        locationCode: 2840,
        languageCode: "en",
      }),
    ).resolves.toEqual({
      data: { graph: null, queries: null },
      billing: { path: PATH, costUsd: 0.011 },
    });
  });

  it("rejects more than five keywords before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGoogleTrendsExplore({
        keywords: ["a", "b", "c", "d", "e", "f"],
        locationCode: 2840,
        languageCode: "en",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
