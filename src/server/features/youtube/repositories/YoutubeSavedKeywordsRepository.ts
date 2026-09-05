import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { youtubeSavedKeywords } from "@/db/youtube/schema";

// SEO Forge: persistence for user-saved YouTube keywords. Research results are
// not stored (R2 cache, see services/research); only what the user chose to keep.

export type YoutubeSavedKeywordRecord =
  typeof youtubeSavedKeywords.$inferSelect;

type YoutubeSavedKeywordSortField =
  | "createdAt"
  | "keyword"
  | "searchVolume"
  | "competition"
  | "overallScore"
  | "wordCount";

export type YoutubeSavedKeywordUpsert = {
  keyword: string;
  locationCode: number;
  languageCode: string;
  searchVolume: number | null;
  volumeConfidence: string | null;
  competition: number | null;
  overallScore: number | null;
  wordCount: number;
  kind: string;
  fetchedAt: string | null;
};

const SORT_COLUMNS = {
  createdAt: youtubeSavedKeywords.createdAt,
  keyword: youtubeSavedKeywords.keyword,
  searchVolume: youtubeSavedKeywords.searchVolume,
  competition: youtubeSavedKeywords.competition,
  overallScore: youtubeSavedKeywords.overallScore,
  wordCount: youtubeSavedKeywords.wordCount,
} as const;

async function upsertMany(params: {
  projectId: string;
  rows: YoutubeSavedKeywordUpsert[];
}): Promise<void> {
  if (params.rows.length === 0) return;
  const updatedAt = new Date().toISOString();

  await runBatch((tx) =>
    params.rows.map((row) =>
      tx
        .insert(youtubeSavedKeywords)
        .values({
          id: crypto.randomUUID(),
          projectId: params.projectId,
          ...row,
        })
        .onConflictDoUpdate({
          target: [
            youtubeSavedKeywords.projectId,
            youtubeSavedKeywords.keyword,
            youtubeSavedKeywords.locationCode,
            youtubeSavedKeywords.languageCode,
          ],
          // Re-saving refreshes the metrics but keeps the original row id and
          // created_at so the saved list stays stable.
          set: {
            searchVolume: row.searchVolume,
            volumeConfidence: row.volumeConfidence,
            competition: row.competition,
            overallScore: row.overallScore,
            wordCount: row.wordCount,
            kind: row.kind,
            fetchedAt: row.fetchedAt,
            updatedAt,
          },
        }),
    ),
  );
}

async function list(params: {
  projectId: string;
  page: number;
  pageSize: number;
  sort: YoutubeSavedKeywordSortField;
  order: "asc" | "desc";
}): Promise<{ rows: YoutubeSavedKeywordRecord[]; total: number }> {
  const where: SQL = eq(youtubeSavedKeywords.projectId, params.projectId);
  const column = SORT_COLUMNS[params.sort];
  const direction = params.order === "asc" ? asc : desc;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(youtubeSavedKeywords)
      .where(where)
      // Secondary key keeps pagination stable when the sort column ties.
      .orderBy(direction(column), asc(youtubeSavedKeywords.id))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ value: count() }).from(youtubeSavedKeywords).where(where),
  ]);

  return { rows, total: totalRow?.value ?? 0 };
}

async function listByIds(params: {
  projectId: string;
  ids: string[];
}): Promise<YoutubeSavedKeywordRecord[]> {
  if (params.ids.length === 0) return [];
  return db
    .select()
    .from(youtubeSavedKeywords)
    .where(
      and(
        eq(youtubeSavedKeywords.projectId, params.projectId),
        inArray(youtubeSavedKeywords.id, params.ids),
      ),
    );
}

async function removeByIds(params: {
  projectId: string;
  ids: string[];
}): Promise<number> {
  if (params.ids.length === 0) return 0;
  // Scope to the project so a caller can never delete another project's rows
  // by guessing ids.
  const existing = await listByIds(params);
  if (existing.length === 0) return 0;
  await db.delete(youtubeSavedKeywords).where(
    and(
      eq(youtubeSavedKeywords.projectId, params.projectId),
      inArray(
        youtubeSavedKeywords.id,
        existing.map((row) => row.id),
      ),
    ),
  );
  return existing.length;
}

export const YoutubeSavedKeywordsRepository = {
  upsertMany,
  list,
  listByIds,
  removeByIds,
} as const;
