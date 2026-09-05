import { expect, test, type Page } from "@playwright/test";

async function getProjectId(page: Page) {
  await page.goto("/");
  await page.waitForURL(/\/p\/([^/]+)\/?$/, { timeout: 30_000 });
  const match = page.url().match(/\/p\/([^/]+)/);
  if (!match) throw new Error(`Could not read project id from ${page.url()}`);
  return match[1];
}

test.describe("YouTube Research", () => {
  test("researches a keyword, switches sub-tabs by URL, and returns to recent searches", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);

    await page.goto(`/p/${projectId}/youtube?q=sourdough%20bread&loc=2840`);
    await expect(
      page.getByRole("heading", { name: "YouTube Research", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("youtube-overview")).toContainText(
      "sourdough bread",
    );
    await expect(
      page.getByRole("row", { name: /sourdough bread recipe/i }).first(),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: "Videos" }).click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("tab"))
      .toBe("videos");
    await expect(page.getByTestId("youtube-video-card")).toHaveCount(12);

    await page.goto(
      `/p/${projectId}/youtube?q=sourdough%20bread&loc=2840&kind=question`,
    );
    await expect(
      page.getByRole("row", { name: /how to make sourdough bread/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("row", { name: /sourdough bread recipe/i }),
    ).toHaveCount(0);

    const recentSearches = page.locator(
      '[data-testid="youtube-research-recent-searches"]:visible',
    );
    await recentSearches.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("q"))
      .toBe(null);
    await expect(
      page.getByRole("link", { name: /sourdough bread\s+US/i }),
    ).toBeVisible();
  });

  test("saves selected keywords and removes them from the Saved sub-tab", async ({
    page,
  }) => {
    const projectId = await getProjectId(page);
    const keyword = `e2e save ${Date.now()}`;

    await page.goto(
      `/p/${projectId}/youtube?q=${encodeURIComponent(keyword)}&loc=2840`,
    );
    const row = page.getByRole("row", {
      name: new RegExp(`${keyword} recipe`, "i"),
    });
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("checkbox", { name: "Select row" }).check();
    await page.getByRole("button", { name: "Save Keywords" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved 1 keyword")).toBeVisible();

    await page.getByRole("tab", { name: "Saved" }).click();
    const savedRow = page.getByRole("row", {
      name: new RegExp(`${keyword} recipe`, "i"),
    });
    await expect(savedRow).toBeVisible({ timeout: 15_000 });
    await savedRow.getByRole("checkbox", { name: "Select row" }).check();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: /Delete 1 keyword/ }).click();
    await expect(savedRow).toHaveCount(0, { timeout: 15_000 });
  });
});
