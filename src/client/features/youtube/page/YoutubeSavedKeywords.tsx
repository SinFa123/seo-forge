import {
  createColumnHelper,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { Bookmark, FileDown, Sheet, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import {
  TableBulkActionBar,
  TableBulkActionButton,
  TableBulkExportMenu,
} from "@/client/components/table/TableBulkActionBar";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { formatNumber } from "@/client/features/keywords/utils";
import {
  DeleteSavedKeywordsModal,
  RemoveSavedKeywordsError,
} from "@/client/features/saved-keywords/SavedKeywordsModals";
import { SavedKeywordsPagination } from "@/client/features/saved-keywords/SavedKeywordsPagination";
import { SavedKeywordsStatus } from "@/client/features/saved-keywords/SavedKeywordsStatus";
import {
  formatSavedKeywordDate,
  type SAVED_KEYWORD_PAGE_SIZES,
} from "@/client/features/saved-keywords/savedKeywordsUtils";
import { buildCsv, downloadCsv } from "@/client/lib/csv";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  youtubeSavedSortFields,
  type GetSavedYoutubeKeywordsInput,
} from "@/types/schemas/youtube";
import type { YoutubeSavedKeywordRow } from "@/types/youtube";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { KindBadge } from "../components/KindBadge";
import { OverallScoreBadge } from "../components/ScoreBadge";
import {
  useRemoveYoutubeKeywordsMutation,
  useYoutubeSavedKeywordsQuery,
} from "../hooks/useYoutubeSavedKeywords";
import { YOUTUBE_EXPORT_HEADERS, youtubeExportRow } from "../youtubeRows";

// SEO Forge: the Saved sub-tab, modelled on upstream's Saved Keywords page
// (server-side sort and paging, selection, confirmed delete).

const columnHelper = createColumnHelper<YoutubeSavedKeywordRow>();
const EXPORT_HEADERS = [...YOUTUBE_EXPORT_HEADERS, "Saved"];

function toSavedSort(
  value: string | undefined,
): GetSavedYoutubeKeywordsInput["sort"] {
  return youtubeSavedSortFields.find((field) => field === value) ?? "createdAt";
}

function exportRow(row: YoutubeSavedKeywordRow) {
  return [...youtubeExportRow(row), row.createdAt];
}

export function YoutubeSavedKeywords({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] =
    useState<(typeof SAVED_KEYWORD_PAGE_SIZES)[number]>(50);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "createdAt", desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const sortState = sorting[0];
  const sort = toSavedSort(sortState?.id);
  const order: "asc" | "desc" = sortState && !sortState.desc ? "asc" : "desc";

  const { data, isLoading, isFetching } = useYoutubeSavedKeywordsQuery({
    projectId,
    page,
    pageSize,
    sort,
    order,
  });
  const rows = data?.rows ?? [];
  const totalCount = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const selectedRows = rows.filter((row) => rowSelection[row.id]);
  const selectedIds = selectedRows.map((row) => row.id);

  useEffect(() => {
    setRowSelection({});
  }, [page, pageSize, sort, order]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const removeMutation = useRemoveYoutubeKeywordsMutation(projectId);
  const handleRemove = () => {
    removeMutation.mutate(selectedIds, {
      onSuccess: (result) => {
        setRowSelection({});
        setShowConfirm(false);
        setRemoveError(null);
        captureClientEvent("youtube_research:saved_remove", {
          count: result.removed,
        });
        toast.success(
          `${result.removed} keyword${result.removed !== 1 ? "s" : ""} removed`,
        );
      },
      onError: (error) => {
        setRemoveError(getStandardErrorMessage(error, "Remove failed."));
      },
    });
  };

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) =>
      typeof updater === "function" ? updater(current) : updater,
    );
    setPage(1);
  };

  const selectAnchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<YoutubeSavedKeywordRow>[]>(
    () => [
      makeSelectionColumn<YoutubeSavedKeywordRow>(selectAnchorRef),
      columnHelper.accessor("keyword", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Keyword" />
        ),
        cell: ({ getValue }) => (
          <span className="font-medium">{getValue()}</span>
        ),
      }),
      columnHelper.accessor("kind", {
        header: () => "Type",
        cell: ({ getValue }) => <KindBadge kind={getValue()} />,
        enableSorting: false,
      }),
      columnHelper.accessor("searchVolume", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Volume (est.)"
            helpText="Estimated monthly YouTube searches at the time of saving, with the estimate's confidence."
          />
        ),
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            {row.original.searchVolume == null
              ? "< 10"
              : formatNumber(row.original.searchVolume)}
            <ConfidenceBadge confidence={row.original.volumeConfidence} />
          </span>
        ),
      }),
      columnHelper.accessor("competition", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Competition"
            helpText="How established the top 20 videos were (0-100): higher means harder."
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
      }),
      columnHelper.accessor("overallScore", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Overall"
            helpText="Opportunity score (0-100): estimated volume balanced against competition. Higher is better."
          />
        ),
        cell: ({ getValue }) => <OverallScoreBadge value={getValue()} />,
      }),
      columnHelper.accessor("wordCount", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Words" />
        ),
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor("createdAt", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Saved" />
        ),
        cell: ({ getValue }) => (
          <span className="text-xs text-base-content/55">
            {formatSavedKeywordDate(getValue())}
          </span>
        ),
      }),
    ],
    [selectAnchorRef],
  );
  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange: setRowSelection,
    onSortingChange: handleSortingChange,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualSorting: true,
  });

  return (
    <div className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="space-y-3 p-4">
        {removeError ? (
          <RemoveSavedKeywordsError message={removeError} />
        ) : null}
        <SavedKeywordsStatus
          totalCount={totalCount}
          isFetching={isFetching && !isLoading}
        />
        <AppDataTable
          table={table}
          className="table table-sm"
          isLoading={isLoading}
          loading={
            <div className="space-y-3" aria-busy>
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="grid grid-cols-8 items-center gap-3"
                >
                  <div className="skeleton h-4" />
                  <div className="skeleton col-span-2 h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                  <div className="skeleton h-4" />
                </div>
              ))}
            </div>
          }
          empty={
            <div className="py-12 text-center text-sm text-base-content/55">
              <Bookmark className="mx-auto mb-2 size-8 opacity-40" />
              <p>
                No saved YouTube keywords yet. Research a keyword and save the
                rows worth keeping.
              </p>
            </div>
          }
        />
      </div>
      <SavedKeywordsPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        isLoading={isFetching}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />

      <TableBulkActionBar
        selectedCount={selectedIds.length}
        onClear={() => setRowSelection({})}
        actions={
          <>
            <div className="flex items-center gap-0.5 px-1.5">
              <TableBulkExportMenu
                actions={[
                  {
                    label: "Export to Sheets",
                    icon: <Sheet className="size-4" />,
                    onClick: () =>
                      void exportTableToSheets({
                        headers: EXPORT_HEADERS,
                        rows: selectedRows.map(exportRow),
                        feature: "youtube_saved",
                      }),
                  },
                  {
                    label: "Export CSV",
                    icon: <FileDown className="size-4" />,
                    onClick: () =>
                      downloadCsv(
                        "youtube-saved-keywords.csv",
                        buildCsv(EXPORT_HEADERS, selectedRows.map(exportRow)),
                      ),
                  },
                ]}
              />
            </div>
            <div className="flex items-center border-l border-base-content/10 px-1.5">
              <TableBulkActionButton
                icon={<Trash2 className="size-3.5" />}
                onClick={() => setShowConfirm(true)}
                variant="danger"
              >
                Delete
              </TableBulkActionButton>
            </div>
          </>
        }
      />

      {showConfirm ? (
        <DeleteSavedKeywordsModal
          selectedCount={selectedIds.length}
          isPending={removeMutation.isPending}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleRemove}
        />
      ) : null}
    </div>
  );
}
