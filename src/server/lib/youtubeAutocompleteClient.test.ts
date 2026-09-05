import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchYoutubeSuggestions } from "@/server/lib/youtubeAutocompleteClient";

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === "string") return new URL(input);
  if (input instanceof URL) return input;
  return new URL(input.url);
}

describe("fetchYoutubeSuggestions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("queries the YouTube suggest endpoint for the market and returns de-duplicated suggestions", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          "how to bake bread",
          [
            "how to bake bread",
            "how to bake bread at home",
            " how to bake bread at home ",
            "",
            "how to bake bread without yeast",
          ],
          [],
          { "google:suggestsubtypes": [[512], [512], [512], [512], [512]] },
        ]),
        {
          headers: { "content-type": "text/javascript; charset=ISO-8859-1" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await fetchYoutubeSuggestions({
      term: "how to bake bread",
      languageCode: "en",
      locationCode: 2826,
    });

    const firstCall = fetchMock.mock.calls[0];
    if (!firstCall) throw new Error("fetch was not called");
    const url = requestUrl(firstCall[0]);
    expect(url.origin + url.pathname).toBe(
      "https://suggestqueries.google.com/complete/search",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client: "firefox",
      ds: "yt",
      hl: "en",
      gl: "gb",
      q: "how to bake bread",
    });
    expect(suggestions).toEqual([
      "how to bake bread",
      "how to bake bread at home",
      "how to bake bread without yeast",
    ]);
  });

  it("degrades to an empty list on an HTTP failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("nope", { status: 503 })),
    );

    await expect(
      fetchYoutubeSuggestions({
        term: "x",
        languageCode: "en",
        locationCode: 2840,
      }),
    ).resolves.toEqual([]);
  });

  it("degrades to an empty list when the payload shape changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify({ items: [] }))),
    );

    await expect(
      fetchYoutubeSuggestions({
        term: "x",
        languageCode: "en",
        locationCode: 2840,
      }),
    ).resolves.toEqual([]);
  });
});
