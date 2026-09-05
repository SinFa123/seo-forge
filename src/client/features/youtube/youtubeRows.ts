import { sort } from "remeda";
import type { CsvValue } from "@/client/lib/csv";
import type { YoutubeKeywordKind, YoutubeKeywordRow } from "@/shared/youtube";
import { YOUTUBE_KEYWORD_COLUMNS } from "@/shared/youtube-columns";
import type { YoutubeSortDir, YoutubeSortField } from "@/types/schemas/youtube";

// SEO Forge: client-side ordering and export of the scored rows. The server
// returns rows ranked by Google anchor volume; the table re-sorts them by the
// URL's sort field with unknown values last in either direction.

export function filterYoutubeRows(
  rows: readonly YoutubeKeywordRow[],
  kind: YoutubeKeywordKind | undefined,
): YoutubeKeywordRow[] {
  return kind ? rows.filter((row) => row.kind === kind) : [...rows];
}

export function sortYoutubeRows(
  rows: readonly YoutubeKeywordRow[],
  sortField: YoutubeSortField,
  sortDir: YoutubeSortDir,
): YoutubeKeywordRow[] {
  const direction = sortDir === "asc" ? 1 : -1;
  return sort(rows, (a, b) => {
    if (sortField === "keyword") {
      return direction * a.keyword.localeCompare(b.keyword);
    }
    const left = a[sortField];
    const right = b[sortField];
    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return direction * (left - right);
  });
}

export const YOUTUBE_EXPORT_HEADERS = YOUTUBE_KEYWORD_COLUMNS.map(
  (column) => column.label,
);

export function youtubeExportRow(row: YoutubeKeywordRow): CsvValue[] {
  return YOUTUBE_KEYWORD_COLUMNS.map((column) => row[column.key] ?? "");
}
