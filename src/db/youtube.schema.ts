import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { projects } from "./app.schema";

// SEO Forge: YouTube Research tables (SQLite / D1). Kept OUT of the upstream
// schema barrels on purpose: these tables have their own Drizzle migration
// stream (drizzle-youtube.config.ts -> drizzle-youtube/) so upstream's journal
// never conflicts with ours. The Postgres twin lives in ./pg/youtube.schema.ts
// and src/db/youtube/schema-parity.test.ts keeps the two identical.
//
// Research results and video snapshots are NOT persisted here; they are cached
// in R2 through src/server/lib/r2-cache.ts. Only user-saved keywords need a
// table.

export const youtubeSavedKeywords = sqliteTable(
  "youtube_saved_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Normalized: trimmed, lower-cased, single-spaced.
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    // Estimated YouTube monthly searches (see shared/youtube.ts); null = unknown.
    searchVolume: integer("search_volume"),
    // "high" | "medium" | "low"
    volumeConfidence: text("volume_confidence"),
    // 0-100
    competition: integer("competition"),
    // 0-100
    overallScore: integer("overall_score"),
    wordCount: integer("word_count").notNull(),
    // "seed" | "related" | "matching" | "question"
    kind: text("kind").notNull(),
    // When the stored metrics were computed (ISO-8601).
    fetchedAt: text("fetched_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("youtube_saved_keywords_unique_project_keyword_market").on(
      table.projectId,
      table.keyword,
      table.locationCode,
      table.languageCode,
    ),
    index("youtube_saved_keywords_project_created_idx").on(
      table.projectId,
      table.createdAt,
    ),
  ],
);
