import type { z } from "zod";
import { getCached } from "@/server/lib/r2-cache";

// SEO Forge: R2 cache conventions for YouTube Research. Namespaces and TTLs
// are the ones in docs/seoforge/PLAN.md section 4; every read is validated
// with Zod so a schema change between write and read degrades to a miss.

export const YOUTUBE_CACHE_NAMESPACE = {
  research: "youtube:research",
  videos: "youtube:videos",
  videoInfo: "youtube:video-info",
  channelStats: "youtube:channel-stats",
} as const;

/** Effectively forever; R2 needs a number and ten years outlives the product. */
const INDEFINITE_SECONDS = 10 * 365 * 24 * 60 * 60;

/**
 * TTLs in seconds. Research and videos results are kept until the user asks
 * for a refresh (single-operator deployment; every result shows its fetch
 * date). Per-video and per-channel snapshots still expire so a refresh picks
 * up new views.
 */
export const YOUTUBE_CACHE_TTL = {
  research: INDEFINITE_SECONDS,
  videos: INDEFINITE_SECONDS,
  videoInfo: 24 * 60 * 60,
  channelStats: 7 * 24 * 60 * 60,
} as const;

/** Cache read validated with Zod; a miss or a stale shape both read as null. */
export async function readCached<T extends z.ZodTypeAny>(
  key: string,
  schema: T,
): Promise<z.infer<T> | null> {
  const parsed = schema.safeParse(await getCached(key));
  return parsed.success ? parsed.data : null;
}
