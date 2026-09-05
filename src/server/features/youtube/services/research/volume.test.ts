import { describe, expect, it, vi } from "vitest";
import { YOUTUBE_SCORING } from "@/shared/youtube";
import {
  type DataforseoClient,
  deriveSeedYoutubeShare,
  fetchSeedTrendsInterest,
  fetchVolumeAnchors,
  meanRecentInterest,
} from "./volume";

const market = { locationCode: 2840, languageCode: "en" };

type AdsSearchVolume = DataforseoClient["keywords"]["adsSearchVolume"];
type Explore = DataforseoClient["trends"]["explore"];

function graphFor(keywords: string[], weekly: Array<Array<number | null>>) {
  return {
    keywords,
    points: weekly.map((values, i) => ({ values, timestamp: i })),
  };
}

describe("fetchVolumeAnchors", () => {
  it("issues one bulk call and maps normalised keywords, keeping unknown ones at null", async () => {
    const adsSearchVolume = vi.fn<AdsSearchVolume>().mockResolvedValue([
      { keyword: "Bake Bread", search_volume: 5000 },
      { keyword: "sourdough", search_volume: null },
      { keyword: "unrelated", search_volume: 10 },
    ]);

    const anchors = await fetchVolumeAnchors(
      { keywords: { adsSearchVolume } },
      {
        ...market,
        keywords: ["bake bread", "sourdough", "bake bread", "no data"],
      },
    );

    expect(adsSearchVolume).toHaveBeenCalledTimes(1);
    expect(adsSearchVolume.mock.calls[0]?.[0].keywords).toEqual([
      "bake bread",
      "sourdough",
      "no data",
    ]);
    expect([...anchors.entries()]).toEqual([
      ["bake bread", 5000],
      ["sourdough", null],
      ["no data", null],
    ]);
  });
});

describe("meanRecentInterest", () => {
  it("averages only the trailing window and ignores missing points", () => {
    const graph = graphFor(
      ["seed", "bench"],
      [
        [100, 100],
        [10, 50],
        [20, 50],
        [30, null],
      ],
    );
    expect(meanRecentInterest(graph, "SEED", 3)).toBe(20);
    expect(meanRecentInterest(graph, "bench", 3)).toBe(50);
    expect(meanRecentInterest(graph, "missing", 3)).toBeNull();
    expect(meanRecentInterest(null, "seed")).toBeNull();
  });
});

describe("fetchSeedTrendsInterest", () => {
  it("sends the seed and the benchmark in one youtube-typed request; the share follows from the anchor", async () => {
    const benchmark = YOUTUBE_SCORING.BENCHMARK.keyword;
    const explore = vi.fn<Explore>().mockResolvedValue({
      graph: graphFor(["bake bread", benchmark], [[50, 100]]),
      queries: null,
    });

    const interest = await fetchSeedTrendsInterest(
      { trends: { explore } },
      { ...market, seed: "bake bread" },
    );

    expect(explore).toHaveBeenCalledTimes(1);
    expect(explore.mock.calls[0]?.[0]).toMatchObject({
      keywords: ["bake bread", benchmark],
      type: "youtube",
    });
    expect(interest).toEqual({ seedInterest: 50, benchmarkInterest: 100 });
    // (50 / 100) * 300k benchmark volume / 100k anchor = 1.5
    expect(deriveSeedYoutubeShare(interest, 100_000)).toBe(1.5);
    expect(deriveSeedYoutubeShare(interest, null)).toBeNull();
  });

  it("returns a null share when Trends has no data for the seed", async () => {
    const explore = vi.fn<Explore>().mockResolvedValue({
      graph: graphFor(
        ["obscure", YOUTUBE_SCORING.BENCHMARK.keyword],
        [[0, 90]],
      ),
      queries: null,
    });

    const interest = await fetchSeedTrendsInterest(
      { trends: { explore } },
      { ...market, seed: "obscure" },
    );

    expect(deriveSeedYoutubeShare(interest, 100)).toBeNull();
  });

  it("sends a single keyword when the seed is the benchmark", async () => {
    const benchmark = YOUTUBE_SCORING.BENCHMARK.keyword;
    const explore = vi.fn<Explore>().mockResolvedValue({
      graph: graphFor([benchmark], [[80]]),
      queries: null,
    });

    const interest = await fetchSeedTrendsInterest(
      { trends: { explore } },
      { ...market, seed: benchmark.toUpperCase() },
    );

    expect(explore.mock.calls[0]?.[0].keywords).toEqual([benchmark]);
    expect(
      deriveSeedYoutubeShare(
        interest,
        YOUTUBE_SCORING.BENCHMARK.youtubeMonthlyVolume,
      ),
    ).toBe(1);
  });
});
