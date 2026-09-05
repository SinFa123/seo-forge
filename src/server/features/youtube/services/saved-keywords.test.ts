import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertMany: vi.fn(async () => {}),
  list: vi.fn(),
  removeByIds: vi.fn(),
}));

vi.mock(
  "@/server/features/youtube/repositories/YoutubeSavedKeywordsRepository",
  () => ({ YoutubeSavedKeywordsRepository: mocks }),
);

import {
  getSavedKeywords,
  removeSavedKeywords,
  saveKeywords,
} from "./saved-keywords";

const market = { locationCode: 2840, languageCode: "en" };

const scored = {
  kind: "matching" as const,
  searchVolume: 1200,
  volumeConfidence: "medium" as const,
  competition: 40,
  overallScore: 55,
  wordCount: 99,
};

describe("youtube saved keywords", () => {
  it("normalises and de-duplicates rows, recounts words, and stamps fetchedAt", async () => {
    vi.setSystemTime(new Date("2026-09-05T12:00:00.000Z"));

    const result = await saveKeywords({
      projectId: "proj_1",
      ...market,
      rows: [
        { ...scored, keyword: " Bake  Bread " },
        { ...scored, keyword: "bake bread", searchVolume: 1500 },
        { ...scored, keyword: "sourdough" },
      ],
    });
    vi.useRealTimers();

    expect(result).toEqual({ saved: 2 });
    expect(mocks.upsertMany).toHaveBeenCalledWith({
      projectId: "proj_1",
      rows: [
        {
          ...scored,
          keyword: "bake bread",
          searchVolume: 1500,
          wordCount: 2,
          ...market,
          fetchedAt: "2026-09-05T12:00:00.000Z",
        },
        {
          ...scored,
          keyword: "sourdough",
          wordCount: 1,
          ...market,
          fetchedAt: "2026-09-05T12:00:00.000Z",
        },
      ],
    });
  });

  it("maps stored records to saved rows and echoes paging", async () => {
    mocks.list.mockResolvedValue({
      total: 7,
      rows: [
        {
          id: "saved_1",
          projectId: "proj_1",
          keyword: "bake bread",
          ...market,
          searchVolume: null,
          volumeConfidence: "low",
          competition: null,
          overallScore: null,
          wordCount: 2,
          kind: "seed",
          fetchedAt: "2026-09-05T12:00:00.000Z",
          createdAt: "2026-09-05 12:00:00",
          updatedAt: "2026-09-05 12:00:00",
        },
      ],
    });

    const result = await getSavedKeywords({
      projectId: "proj_1",
      page: 2,
      pageSize: 5,
      sort: "overallScore",
      order: "desc",
    });

    expect(mocks.list).toHaveBeenCalledWith({
      projectId: "proj_1",
      page: 2,
      pageSize: 5,
      sort: "overallScore",
      order: "desc",
    });
    expect(result).toEqual({
      total: 7,
      page: 2,
      pageSize: 5,
      rows: [
        {
          id: "saved_1",
          projectId: "proj_1",
          keyword: "bake bread",
          ...market,
          kind: "seed",
          searchVolume: null,
          volumeConfidence: "low",
          competition: null,
          overallScore: null,
          wordCount: 2,
          fetchedAt: "2026-09-05T12:00:00.000Z",
          createdAt: "2026-09-05 12:00:00",
        },
      ],
    });
  });

  it("removes by id within the project and reports the count", async () => {
    mocks.removeByIds.mockResolvedValue(2);

    await expect(
      removeSavedKeywords({
        projectId: "proj_1",
        savedKeywordIds: ["a", "b", "c"],
      }),
    ).resolves.toEqual({ removed: 2 });
    expect(mocks.removeByIds).toHaveBeenCalledWith({
      projectId: "proj_1",
      ids: ["a", "b", "c"],
    });
  });
});
