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

/** TTLs in seconds. */
export const YOUTUBE_CACHE_TTL = {
  research: 24 * 60 * 60,
  videos: 6 * 60 * 60,
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
