import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YoutubeKeywordRow } from "@/shared/youtube";
import { makeToolContext, textContent } from "./tool-test-support";
import {
  getYoutubeVideosTool,
  listSavedYoutubeKeywordsTool,
  researchYoutubeKeywordsTool,
  saveYoutubeKeywordsTool,
} from "./youtube-tools";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  research: vi.fn(),
  getVideos: vi.fn(),
  saveKeywords: vi.fn(),
  getSavedKeywords: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

// project-auth imports the repository for user-scoped (API key) credentials;
// unused here (pinned context) but keeps the db out of the module graph.
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getMembership: vi.fn() },
}));

vi.mock("@/server/features/youtube/services/YoutubeResearchService", () => ({
  YoutubeResearchService: {
    research: mocks.research,
    getVideos: mocks.getVideos,
    saveKeywords: mocks.saveKeywords,
    getSavedKeywords: mocks.getSavedKeywords,
  },
}));

const toolContext = makeToolContext();

const seedRow = {
  keyword: "bake bread",
  kind: "seed" as const,
  searchVolume: 12000,
  volumeConfidence: "high" as const,
  competition: 61,
  overallScore: 48,
  wordCount: 2,
  medianViewsPerHour: 12.34,
  videoCount: 20,
};

const candidateRow: YoutubeKeywordRow = {
  keyword: "how to bake bread",
  kind: "question",
  searchVolume: null,
  volumeConfidence: "low",
  competition: null,
  overallScore: null,
  wordCount: 4,
};

describe("YouTube MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("research_youtube_keywords returns per-seed results and renders the shared columns", async () => {
    mocks.research.mockImplementation(
      async ({ keyword }: { keyword: string }) => {
        if (keyword === "broken")
          throw new Error("DataForSEO rejected the seed");
        return {
          seed: seedRow,
          rows: [candidateRow, { ...candidateRow, keyword: "bread recipe" }],
          diagnostics: { candidateCount: 2, serpRowCount: 5 },
          fetchedAt: "2026-09-05T12:00:00.000Z",
        };
      },
    );

    const result = await researchYoutubeKeywordsTool.handler(
      {
        projectId: "project_1",
        seeds: [{ seed: "bake bread" }, { seed: "broken" }],
        serpRowLimit: 5,
        rowLimit: 1,
      },
      toolContext,
    );

    expect(mocks.research).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        keyword: "bake bread",
        locationCode: 2840,
        languageCode: "en",
        serpRowLimit: 5,
        refresh: false,
      },
      expect.objectContaining({ organizationId: "org_123" }),
    );
    expect(result.structuredContent.results).toEqual([
      expect.objectContaining({
        seed: "bake bread",
        ok: true,
        rowCount: 1,
        totalRowCount: 2,
        notes: [
          expect.stringContaining("estimate"),
          expect.stringContaining("top 5 rows"),
        ],
      }),
      { seed: "broken", ok: false, error: "DataForSEO rejected the seed" },
    ]);
    expect(textContent(result)).toContain('"bake bread" — 1 of 2 keywords');
    const text = textContent(result);
    expect(text).toContain(
      "Keyword | Search volume (est.) | Confidence | Competition | Overall | Words | Type",
    );
    expect(text).toContain("bake bread | 12,000 | high | 61 | 48 | 2 | seed");
    expect(text).toContain(
      "how to bake bread | < 10 | low | — | — | 4 | question",
    );
    expect(text).toContain('"broken" — FAILED');
  });

  it("get_youtube_videos renders the video table and explains a missing Data API key", async () => {
    mocks.getVideos.mockResolvedValue({
      keyword: "bake bread",
      rows: [
        {
          rank: 1,
          videoId: "abc",
          title: "Bread",
          url: "https://www.youtube.com/watch?v=abc",
          thumbnailUrl: null,
          channelId: "c1",
          channelName: "Baker",
          channelUrl: null,
          channelLogoUrl: null,
          publishedAt: "2026-08-06T12:00:00.000Z",
          publishedLabel: "1 month ago",
          viewsCount: 100000,
          likesCount: null,
          commentsCount: null,
          durationSeconds: 754,
          isShorts: false,
          isLive: false,
          viewsPerHour: 138.9,
          subscribersCount: 20000,
          channelMultiplier: null,
        },
      ],
      channels: [
        {
          channelId: "c1",
          channelName: "Baker",
          channelUrl: null,
          channelLogoUrl: null,
          subscribersCount: 20000,
          viewsCount: 100000,
          videoCount: 1,
          bestRank: 1,
          maxChannelMultiplier: null,
          breakout: true,
        },
      ],
      dataApiStatus: "not_configured",
      fetchedAt: "2026-09-05T12:00:00.000Z",
    });

    const result = await getYoutubeVideosTool.handler(
      { projectId: "project_1", keyword: "bake bread" },
      toolContext,
    );

    expect(mocks.getVideos).toHaveBeenCalledWith(
      {
        projectId: "project_1",
        keyword: "bake bread",
        locationCode: 2840,
        languageCode: "en",
        depth: 20,
        refresh: false,
      },
      expect.objectContaining({ projectId: "project_1" }),
    );
    const text = textContent(result);
    expect(text).toContain(
      "1 | Bread | Baker | 1 month ago | 100,000 | 139 | — | 20,000 | 12:34 | no | https://www.youtube.com/watch?v=abc",
    );
    expect(text).toContain("Baker | 20,000 | 100,000 | 1 | 1 | — | yes | —");
    expect(text).toContain("YOUTUBE_DATA_API_KEY is not configured");
    expect(result.structuredContent.dataApiStatus).toBe("not_configured");
  });

  it("get_youtube_videos rejects a language the location does not serve", async () => {
    await expect(
      getYoutubeVideosTool.handler(
        { projectId: "project_1", keyword: "bake bread", languageCode: "vi" },
        toolContext,
      ),
    ).rejects.toThrow(/not available for this location/);
    expect(mocks.getVideos).not.toHaveBeenCalled();
  });

  it("save_youtube_keywords resolves the project market and passes rows through", async () => {
    mocks.saveKeywords.mockResolvedValue({ saved: 1 });

    const result = await saveYoutubeKeywordsTool.handler(
      { projectId: "project_1", rows: [candidateRow] },
      toolContext,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      rows: [candidateRow],
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.structuredContent).toMatchObject({
      savedCount: 1,
      keywords: ["how to bake bread"],
    });
  });

  it("list_saved_youtube_keywords lists with defaults and renders rows", async () => {
    mocks.getSavedKeywords.mockResolvedValue({
      rows: [{ ...candidateRow, id: "saved_1" }],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    const result = await listSavedYoutubeKeywordsTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(mocks.getSavedKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      page: 1,
      pageSize: 100,
      sort: "createdAt",
      order: "desc",
    });
    expect(textContent(result)).toContain("how to bake bread | < 10 | low");
    expect(result.structuredContent.totalCount).toBe(1);
  });

  it("refuses a project outside the caller's organization before touching the service", async () => {
    mocks.getProjectForOrganization.mockResolvedValue(null);

    await expect(
      listSavedYoutubeKeywordsTool.handler(
        { projectId: "someone_elses" },
        toolContext,
      ),
    ).rejects.toThrow("FORBIDDEN");
    await expect(
      saveYoutubeKeywordsTool.handler(
        { projectId: "someone_elses", rows: [candidateRow] },
        toolContext,
      ),
    ).rejects.toThrow("FORBIDDEN");
    expect(mocks.getSavedKeywords).not.toHaveBeenCalled();
    expect(mocks.saveKeywords).not.toHaveBeenCalled();
  });
});
