import { describe, expect, it, vi } from "vitest";
import type { BillingCustomerContext } from "@/server/billing/subscription";

const keywords = vi.hoisted(() => ({
  related: vi.fn(),
  suggestions: vi.fn(),
  ideas: vi.fn(),
}));

vi.mock("@/server/lib/r2-cache", () => ({
  CACHE_TTL: { researchResult: 86400 },
  buildCacheKey: vi.fn(async () => "kw:research:key"),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
}));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: () => ({ keywords }),
}));

vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: { upsertKeywordMetric: vi.fn(async () => {}) },
  }),
);

import { research } from "./research";

const billingCustomer: BillingCustomerContext = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "alice@example.com",
};

function keywordItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    keyword: `${prefix} ${i}`,
  }));
}

describe("research auto mode", () => {
  it("tops up from later sources with only the missing rows and stops once full", async () => {
    keywords.related.mockResolvedValue(
      keywordItems("related", 100).map((keyword_data) => ({ keyword_data })),
    );
    // 10 of the 60 suggestions repeat related rows, so suggestions fill
    // exactly the 50 missing rows.
    keywords.suggestions.mockResolvedValue([
      ...keywordItems("related", 10),
      ...keywordItems("suggestion", 50),
    ]);

    const result = await research(
      {
        projectId: "proj_1",
        keywords: ["seed"],
        locationCode: 2840,
        languageCode: "en",
        resultLimit: 150,
        mode: "auto",
        clickstream: false,
      },
      billingCustomer,
    );

    expect(result.rows).toHaveLength(150);
    expect(keywords.suggestions).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
    expect(keywords.ideas).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: "suggestions", usedFallback: true });
  });
});
