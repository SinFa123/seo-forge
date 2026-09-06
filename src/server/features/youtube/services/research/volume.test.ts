import { describe, expect, it, vi } from "vitest";
import {
  type DataforseoClient,
  fetchVolumeAnchors,
  meanRecentInterest,
} from "./volume";

const market = { locationCode: 2840, languageCode: "en" };

type AdsSearchVolume = DataforseoClient["keywords"]["adsSearchVolume"];

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
