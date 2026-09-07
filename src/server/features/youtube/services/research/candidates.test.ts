import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/lib/youtubeAutocompleteClient", () => ({
  fetchYoutubeSuggestions: vi.fn(),
}));

import { fetchYoutubeSuggestions } from "@/server/lib/youtubeAutocompleteClient";
import {
  containsSeed,
  contextWords,
  generateCandidates,
  isOnTopic,
  isUsableCandidate,
} from "./candidates";

const market = { locationCode: 2840, languageCode: "en" };

describe("generateCandidates", () => {
  it("keeps on-topic candidates in source order: seed suggestions, ranking-video tags, Trends, expansions", async () => {
    vi.mocked(fetchYoutubeSuggestions).mockImplementation(async ({ term }) => {
      if (term === "bake bread") return ["Bake Bread", "bake bread at home"];
      if (term === "how to bake bread") return ["how to bake bread?"];
      if (term === "bake bread a") {
        return ["bake bread airfryer", "bake  bread at home"];
      }
      // YouTube could not extend "bake bread b" and fell back to another topic.
      if (term === "bake bread b") return ["bake beans"];
      return [];
    });

    const result = await generateCandidates({
      seed: " Bake  Bread ",
      ...market,
      trendsRelated: {
        top: ["sourdough bread", "banana muffins", "bread"],
        rising: ["bake bread at home"],
      },
      seedVideos: [
        {
          title: "Easy sourdough loaf",
          tags: ["Sourdough", "bread recipe", "kitchen"],
        },
        {
          title: "Sourdough for beginners",
          tags: ["sourdough", "bread recipe", "youtube"],
        },
        {
          title: "Dutch oven bread",
          tags: ["Dutch oven", "bread recipe", "bread"],
        },
      ],
    });

    expect(result.candidates).toEqual([
      { keyword: "bake bread at home", kind: "matching", source: "suggest" },
      // Tags: on 3 videos, then 2 videos; "kitchen" and "dutch oven" are on
      // one video and share no seed word; "youtube" is a platform tag.
      { keyword: "bread recipe", kind: "related", source: "tag" },
      { keyword: "sourdough", kind: "related", source: "tag" },
      { keyword: "sourdough bread", kind: "related", source: "trends_top" },
      { keyword: "how to bake bread", kind: "question", source: "suggest" },
      { keyword: "bake bread airfryer", kind: "matching", source: "suggest" },
    ]);
    expect(result.tagCandidateCount).toBe(2);
    // Dropped: "banana muffins" (Trends, shares nothing), "bread" (Trends, a
    // seed fragment), "bake beans" (fuzzy suggestion).
    expect(result.droppedOffTopicCount).toBe(3);
    // seed + 9 question prefixes + 26 letters
    expect(result.suggestCalls).toBe(36);
    expect(fetchYoutubeSuggestions).toHaveBeenCalledTimes(36);
  });

  it("caps candidates before hydration", async () => {
    vi.mocked(fetchYoutubeSuggestions).mockImplementation(async ({ term }) =>
      term === "bake bread"
        ? ["bake bread one", "bake bread two", "bake bread three"]
        : [],
    );

    const result = await generateCandidates({
      seed: "bake bread",
      ...market,
      trendsRelated: { top: [], rising: [] },
      limit: 2,
    });

    expect(result.candidates.map((c) => c.keyword)).toEqual([
      "bake bread one",
      "bake bread two",
    ]);
  });
});

describe("relevance rules", () => {
  it("containsSeed needs every seed word, stemmed", () => {
    expect(containsSeed("Sarah Tang interview", "sarah tang")).toBe(true);
    expect(containsSeed("sarah baker", "sarah tang")).toBe(false);
    expect(containsSeed("bread recipes", "bread recipe")).toBe(true);
  });

  it("a shared word counts only when it recurs across the ranking videos and is not a seed word", () => {
    const context = contextWords("sarah tang", [
      {
        title: "Sarah Tang: my Prague apartment tour",
        tags: ["prague", "sarah tang"],
      },
      {
        title: "Moving to Prague | Sarah Tang",
        tags: ["czech republic", "travel"],
      },
      { title: "House Hunters International: Sarah Eggar", tags: ["hgtv"] },
    ]);
    expect([...context]).toEqual(["prague"]);
    expect(isOnTopic("prague travel guide", "sarah tang", context)).toBe(true);
    expect(isOnTopic("sarah eggar hgtv", "sarah tang", context)).toBe(false);
    expect(isOnTopic("sarah tang vlog", "sarah tang", context)).toBe(true);
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
