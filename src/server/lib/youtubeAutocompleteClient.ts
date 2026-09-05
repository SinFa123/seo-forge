import { z } from "zod";
import { getIsoCountryCode } from "@/shared/keyword-locations";

// YouTube search suggestions via Google's public suggest endpoint (the same
// source the YouTube search box uses). Unofficial and unmetered: no key, no
// documented contract, may change without notice. Failures therefore degrade to
// an empty list with a warning rather than failing a research run, and the
// caller treats suggestions as candidate keywords only — never as metrics.
//
// Verified live 2026-09-05: `client=firefox` returns plain JSON of the shape
// [query, string[] suggestions, [], { "google:suggestsubtypes": ... }].
// `client=youtube` returns a JSONP wrapper and is not used.

const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";
const REQUEST_TIMEOUT_MS = 8_000;

const suggestResponseSchema = z
  .tuple([z.string(), z.array(z.string())])
  .rest(z.unknown());

export async function fetchYoutubeSuggestions(input: {
  term: string;
  languageCode: string;
  locationCode: number;
}): Promise<string[]> {
  const params = new URLSearchParams({
    client: "firefox",
    ds: "yt",
    hl: input.languageCode,
    gl: getIsoCountryCode(input.locationCode),
    q: input.term,
  });

  try {
    const response = await fetch(`${SUGGEST_URL}?${params.toString()}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn("youtube-suggest.http-failed", { status: response.status });
      return [];
    }
    // Content-Type varies (text/javascript with a legacy charset has been
    // seen), so read text and parse rather than trusting response.json().
    const parsed = suggestResponseSchema.safeParse(
      JSON.parse(await response.text()),
    );
    if (!parsed.success) {
      console.warn("youtube-suggest.invalid-payload", {
        issues: parsed.error.issues.slice(0, 3),
      });
      return [];
    }
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const raw of parsed.data[1]) {
      const suggestion = raw.trim();
      if (!suggestion || seen.has(suggestion)) continue;
      seen.add(suggestion);
      suggestions.push(suggestion);
    }
    return suggestions;
  } catch (error) {
    console.warn("youtube-suggest.failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
