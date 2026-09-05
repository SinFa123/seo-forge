import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects } from "./app.schema";

// SEO Forge: YouTube Research tables (Postgres twin of ../youtube.schema.ts).
// See that file for why these stay out of the upstream barrels.
// See src/db/pg/app.schema.ts for why timestamps are ISO-8601 UTC text.
const isoNow = sql`to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

export const youtubeSavedKeywords = pgTable(
  "youtube_saved_keywords",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    languageCode: text("language_code").notNull(),
    searchVolume: integer("search_volume"),
    volumeConfidence: text("volume_confidence"),
    competition: integer("competition"),
    overallScore: integer("overall_score"),
    wordCount: integer("word_count").notNull(),
    kind: text("kind").notNull(),
    fetchedAt: text("fetched_at"),
    createdAt: text("created_at").notNull().default(isoNow),
    updatedAt: text("updated_at").notNull().default(isoNow),
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
