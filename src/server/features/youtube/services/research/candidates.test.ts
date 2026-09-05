import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/youtubeAutocompleteClient", () => ({
  fetchYoutubeSuggestions: vi.fn(),
}));

import { fetchYoutubeSuggestions } from "@/server/lib/youtubeAutocompleteClient";
import { generateCandidates, isUsableCandidate } from "./candidates";

const market = { locationCode: 2840, languageCode: "en" };

describe("generateCandidates", () => {
  it("de-duplicates, drops the seed, classifies, and keeps seed suggestions ahead of Trends and expansions", async () => {
    vi.mocked(fetchYoutubeSuggestions).mockImplementation(async ({ term }) => {
      if (term === "bake bread") return ["Bake Bread", "bake bread at home"];
      if (term === "how to bake bread") return ["how to bake bread?"];
      if (term === "bake bread a")
        return ["bake bread airfryer", "bake  bread at home"];
      return [];
    });

    const result = await generateCandidates({
      seed: " Bake  Bread ",
      ...market,
      trendsRelated: {
        top: ["sourdough starter"],
        rising: ["bake bread at home"],
      },
    });

    expect(result.candidates).toEqual([
      { keyword: "bake bread at home", kind: "matching", source: "suggest" },
      { keyword: "sourdough starter", kind: "related", source: "trends_top" },
      { keyword: "how to bake bread", kind: "question", source: "suggest" },
      { keyword: "bake bread airfryer", kind: "matching", source: "suggest" },
    ]);
    // seed + 9 question prefixes + 26 letters
    expect(result.suggestCalls).toBe(36);
    expect(fetchYoutubeSuggestions).toHaveBeenCalledTimes(36);
    expect(result.suggestionCount).toBe(5);
  });

  it("caps candidates before hydration", async () => {
    vi.mocked(fetchYoutubeSuggestions).mockImplementation(async ({ term }) =>
      term === "bake bread" ? ["one", "two", "three"] : [],
    );

    const result = await generateCandidates({
      seed: "bake bread",
      ...market,
      trendsRelated: { top: [], rising: [] },
      limit: 2,
    });

    expect(result.candidates.map((c) => c.keyword)).toEqual(["one", "two"]);
  });
});

describe("isUsableCandidate", () => {
  it("rejects keywords Google Ads would refuse", () => {
    expect(isUsableCandidate("café con leche")).toBe(true);
    expect(isUsableCandidate("rock 'n' roll")).toBe(true);
    expect(isUsableCandidate("how to bake bread?")).toBe(false);
    expect(isUsableCandidate("a b c d e f g h i j k")).toBe(false);
    expect(isUsableCandidate("x".repeat(81))).toBe(false);
  });
});
