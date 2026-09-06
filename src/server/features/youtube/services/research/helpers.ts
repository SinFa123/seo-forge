// SEO Forge: pure helpers shared by the YouTube research services. Upstream
// has no shared concurrency limiter, and one is not worth a dependency, so it
// lives here next to its only callers. Nothing in this file touches I/O, so
// the candidate generator can import it without pulling in Workers bindings.

/**
 * Parallel DataForSEO / Data API / suggest calls in flight at once. DataForSEO
 * live endpoints allow well over this; the bound mainly keeps one research run
 * from monopolising the Worker's outbound connections.
 */
export const YOUTUBE_FETCH_CONCURRENCY = 16;

/**
 * Runs `fn` over `items` with at most `limit` promises in flight, preserving
 * order. A rejection propagates like Promise.all.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) break;
      results[index] = await fn(item, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/**
 * DataForSEO timestamps look like "2025-07-21 12:01:32 +00:00". Normalise to
 * ISO-8601 so Date.parse is unambiguous on every runtime.
 */
export function parseDataforseoTimestamp(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const match = value
    .trim()
    .match(
      /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}:\d{2}|Z)?$/,
    );
  const iso = match
    ? `${match[1]}T${match[2]}${match[3] ?? "Z"}`
    : value.trim();
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}
