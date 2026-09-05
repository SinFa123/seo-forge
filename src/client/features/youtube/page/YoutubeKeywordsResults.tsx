import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { FileDown, Save, Sheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
  TableExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { KeywordResearchPagination } from "@/client/features/keywords/page/KeywordResearchPagination";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  YOUTUBE_KEYWORD_KINDS,
  type YoutubeKeywordKind,
  type YoutubeKeywordRow,
} from "@/shared/youtube";
import {
  youtubeSortFields,
  type YoutubeSortDir,
  type YoutubeSortField,
} from "@/types/schemas/youtube";
import { YoutubeKeywordsTable } from "./YoutubeKeywordsTable";
import { YOUTUBE_EXPORT_HEADERS, youtubeExportRow } from "../youtubeRows";

const PAGE_SIZES = [50, 100, 300, 500] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const KIND_FILTERS: Array<{
  value: YoutubeKeywordKind | undefined;
  label: string;
}> = [
  { value: undefined, label: "All" },
  ...YOUTUBE_KEYWORD_KINDS.filter((kind) => kind !== "seed").map((kind) => ({
    value: kind,
    label:
      kind === "question"
        ? "Questions"
        : `${kind[0]?.toUpperCase()}${kind.slice(1)}`,
  })),
];

function useYoutubePagination(rows: YoutubeKeywordRow[]) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [rows]);
  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows]);
  return { page, pageSize, pageRows, setPage, setPageSize };
}

function downloadYoutubeCsv(rows: YoutubeKeywordRow[], scope: string) {
  downloadCsv(
    "youtube-keywords.csv",
    buildCsv(YOUTUBE_EXPORT_HEADERS, rows.map(youtubeExportRow)),
  );
  captureClientEvent("data:export", {
    source_feature: "youtube_research",
    result_count: rows.length,
    scope,
  });
}

function exportYoutubeSheets(rows: YoutubeKeywordRow[]) {
  void exportTableToSheets({
    headers: YOUTUBE_EXPORT_HEADERS,
    rows: rows.map(youtubeExportRow),
    feature: "youtube_research",
  });
}

export function YoutubeKeywordsResults({
  rows,
  totalRowCount,
  seedKeyword,
  kind,
  onKindChange,
  sortField,
  sortDir,
  onSortChange,
  selectedKeywords,
  onSelectedKeywordsChange,
  onSave,
}: {
  /** Rows after the kind filter and sort. */
  rows: YoutubeKeywordRow[];
  totalRowCount: number;
  seedKeyword: string;
  kind: YoutubeKeywordKind | undefined;
  onKindChange: (kind: YoutubeKeywordKind | undefined) => void;
  sortField: YoutubeSortField;
  sortDir: YoutubeSortDir;
  onSortChange: (sortField: YoutubeSortField, sortDir: YoutubeSortDir) => void;
  selectedKeywords: Set<string>;
  onSelectedKeywordsChange: (keywords: Set<string>) => void;
  onSave: () => void;
}) {
  const { page, pageSize, pageRows, setPage, setPageSize } =
    useYoutubePagination(rows);

  const rowSelection = useMemo<RowSelectionState>(
    () => Object.fromEntries([...selectedKeywords].map((k) => [k, true])),
    [selectedKeywords],
  );
  const sorting = useMemo<SortingState>(
    () => [{ id: sortField, desc: sortDir === "desc" }],
    [sortDir, sortField],
  );
  const selectedRows = rows.filter((row) => selectedKeywords.has(row.keyword));

  const countLabel =
    selectedKeywords.size > 0
      ? `${selectedKeywords.size} of ${rows.length} selected`
      : kind
        ? `Showing ${rows.length} of ${totalRowCount} keywords`
        : `Showing ${rows.length} keywords`;

  return (
    <div className="flex-1 flex flex-col min-w-0 border border-base-300 rounded-xl bg-base-100 overflow-hidden">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-2 border-b border-base-300">
        <div className="join" role="group" aria-label="Keyword type">
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={`btn btn-xs join-item ${
                kind === filter.value ? "btn-active" : "btn-ghost"
              }`}
              aria-pressed={kind === filter.value}
              onClick={() => onKindChange(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <span className="text-sm text-base-content/60">{countLabel}</span>
        <div className="flex-1" />
        <TableExportMenu
          buttonClassName={`btn btn-ghost btn-sm gap-1 ${rows.length === 0 ? "btn-disabled" : ""}`}
          actions={[
            {
              label: "Export to Sheets",
              icon: <Sheet className="size-4" />,
              onClick: () => exportYoutubeSheets(rows),
              disabled: rows.length === 0,
            },
            {
              label: "Export CSV",
              icon: <FileDown className="size-4" />,
              onClick: () => downloadYoutubeCsv(rows, "all"),
              disabled: rows.length === 0,
            },
          ]}
        />
      </div>

      <TableBulkActionBar
        selectedCount={selectedKeywords.size}
        onClear={() => onSelectedKeywordsChange(new Set())}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<Save className="size-3.5" />}
              onClick={onSave}
            >
              Save Keywords
            </TableBulkActionButton>
            <TableBulkExportMenu
              actions={[
                {
                  label: "Export to Sheets",
                  icon: <Sheet className="size-4" />,
                  onClick: () => exportYoutubeSheets(selectedRows),
                },
                {
                  label: "Export CSV",
                  icon: <FileDown className="size-4" />,
                  onClick: () => downloadYoutubeCsv(selectedRows, "selection"),
                },
              ]}
            />
          </div>
        }
      />

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center text-base-content/50">
          <p className="text-sm font-medium">
            No keywords of this type were found.
          </p>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onKindChange(undefined)}
          >
            Show all types
          </button>
        </div>
      ) : (
        <>
          <YoutubeKeywordsTable
            rows={pageRows}
            rowSelection={rowSelection}
            sorting={sorting}
            highlightedKeyword={seedKeyword}
            onRowSelectionChange={(updater) => {
              const next =
                typeof updater === "function" ? updater(rowSelection) : updater;
              onSelectedKeywordsChange(
                new Set(
                  Object.entries(next)
                    .filter(([, selected]) => selected)
                    .map(([keyword]) => keyword),
                ),
              );
            }}
            onSortingChange={(updater) => {
              const next =
                typeof updater === "function" ? updater(sorting) : updater;
              const first = next[0];
              if (!first) {
                onSortChange("searchVolume", "desc");
                return;
              }
              onSortChange(
                youtubeSortFields.find((field) => field === first.id) ??
                  "searchVolume",
                first.desc ? "desc" : "asc",
              );
            }}
          />
          <KeywordResearchPagination
            page={page}
            pageSize={pageSize}
            totalCount={rows.length}
            onPageChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        </>
      )}
    </div>
  );
}
