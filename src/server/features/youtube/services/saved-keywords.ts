import {
  YoutubeSavedKeywordsRepository,
  type YoutubeSavedKeywordRecord,
  type YoutubeSavedKeywordUpsert,
} from "@/server/features/youtube/repositories/YoutubeSavedKeywordsRepository";
import {
  YOUTUBE_KEYWORD_KINDS,
  YOUTUBE_VOLUME_CONFIDENCES,
  countWords,
  normalizeYoutubeKeyword,
  type YoutubeKeywordKind,
  type YoutubeVolumeConfidence,
} from "@/shared/youtube";
import type {
  GetSavedYoutubeKeywordsInput,
  RemoveSavedYoutubeKeywordsInput,
  ResolvedSaveYoutubeKeywordsInput,
} from "@/types/schemas/youtube";
import type { YoutubeSavedKeywordRow } from "@/types/youtube";

// SEO Forge: the Saved sub-tab. Rows arrive already scored from the research
// result, so saving is a metrics snapshot keyed by (project, keyword, market);
// re-saving refreshes the snapshot in place.

function isKind(value: string): value is YoutubeKeywordKind {
  return (YOUTUBE_KEYWORD_KINDS as readonly string[]).includes(value);
}

function isConfidence(value: string | null): value is YoutubeVolumeConfidence {
  return (
    value != null &&
    (YOUTUBE_VOLUME_CONFIDENCES as readonly string[]).includes(value)
  );
}

function toSavedRow(record: YoutubeSavedKeywordRecord): YoutubeSavedKeywordRow {
  return {
    id: record.id,
    projectId: record.projectId,
    keyword: record.keyword,
    locationCode: record.locationCode,
    languageCode: record.languageCode,
    kind: isKind(record.kind) ? record.kind : "related",
    searchVolume: record.searchVolume,
    volumeConfidence: isConfidence(record.volumeConfidence)
      ? record.volumeConfidence
      : "low",
    competition: record.competition,
    overallScore: record.overallScore,
    wordCount: record.wordCount,
    fetchedAt: record.fetchedAt,
    createdAt: record.createdAt,
  };
}

export async function saveKeywords(
  input: ResolvedSaveYoutubeKeywordsInput,
): Promise<{ saved: number }> {
  const fetchedAt = new Date().toISOString();
  const byKeyword = new Map<string, YoutubeSavedKeywordUpsert>();
  for (const row of input.rows) {
    const keyword = normalizeYoutubeKeyword(row.keyword);
    if (keyword.length === 0) continue;
    // Last occurrence wins so a duplicate in one request cannot conflict
    // inside the batch.
    byKeyword.set(keyword, {
      keyword,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      searchVolume: row.searchVolume,
      volumeConfidence: row.volumeConfidence,
      competition: row.competition,
      overallScore: row.overallScore,
      wordCount: countWords(keyword),
      kind: row.kind,
      fetchedAt,
    });
  }
  const rows = [...byKeyword.values()];
  await YoutubeSavedKeywordsRepository.upsertMany({
    projectId: input.projectId,
    rows,
  });
  return { saved: rows.length };
}

export async function getSavedKeywords(
  input: GetSavedYoutubeKeywordsInput,
): Promise<{
  rows: YoutubeSavedKeywordRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const result = await YoutubeSavedKeywordsRepository.list({
    projectId: input.projectId,
    page: input.page,
    pageSize: input.pageSize,
    sort: input.sort,
    order: input.order,
  });
  return {
    rows: result.rows.map(toSavedRow),
    total: result.total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function removeSavedKeywords(
  input: RemoveSavedYoutubeKeywordsInput,
): Promise<{ removed: number }> {
  const removed = await YoutubeSavedKeywordsRepository.removeByIds({
    projectId: input.projectId,
    ids: input.savedKeywordIds,
  });
  return { removed };
}
