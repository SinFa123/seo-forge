import {
  createColumnHelper,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo } from "react";
import {
  AppDataTable,
  makeSelectionColumn,
  useAppTable,
  useSelectionAnchor,
} from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { formatNumber } from "@/client/features/keywords/utils";
import type { YoutubeKeywordRow } from "@/shared/youtube";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { KindBadge } from "../components/KindBadge";
import { OverallScoreBadge } from "../components/ScoreBadge";

const columnHelper = createColumnHelper<YoutubeKeywordRow>();

const NUMERIC_META = {
  headerClassName: "text-right",
  cellClassName:
    "whitespace-nowrap text-right tabular-nums text-base-content/70",
};

export function YoutubeKeywordsTable({
  rows,
  rowSelection,
  sorting,
  onRowSelectionChange,
  onSortingChange,
  highlightedKeyword,
}: {
  rows: YoutubeKeywordRow[];
  rowSelection: RowSelectionState;
  sorting: SortingState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onSortingChange: OnChangeFn<SortingState>;
  highlightedKeyword: string | null;
}) {
  const selectAnchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<YoutubeKeywordRow>[]>(
    () => [
      makeSelectionColumn<YoutubeKeywordRow>(selectAnchorRef),
      columnHelper.accessor("keyword", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Keyword" />
        ),
        cell: ({ row }) => (
          <span
            className="block min-w-48 whitespace-normal break-words font-medium capitalize md:min-w-0 md:truncate"
            title={row.original.keyword}
          >
            {row.original.keyword}
          </span>
        ),
        meta: {
          headerClassName: "min-w-48 md:min-w-0",
          cellClassName: "min-w-48 md:min-w-0",
        },
      }),
      columnHelper.accessor("searchVolume", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Volume (est.)"
            helpText="Estimated monthly YouTube searches: Google Ads volume scaled by YouTube-specific Google Trends interest. The badge shows the estimate's confidence."
            align="right"
          />
        ),
        cell: ({ row }) => (
          <span className="inline-flex items-center justify-end gap-1.5">
            <span>
              {row.original.searchVolume == null
                ? "< 10"
                : formatNumber(row.original.searchVolume)}
            </span>
            <ConfidenceBadge confidence={row.original.volumeConfidence} />
          </span>
        ),
        meta: NUMERIC_META,
      }),
      columnHelper.accessor("competition", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Competition"
            helpText="How established the top 20 videos are (0-100): views, freshness, channel domination, and Shorts share. Higher means harder. Empty when no SERP was bought for the row."
            align="right"
          />
        ),
        cell: ({ getValue }) => <DifficultyBadge value={getValue()} />,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      }),
      columnHelper.accessor("overallScore", {
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label="Overall"
            helpText="Opportunity score (0-100): estimated volume balanced against competition. Higher is better."
            align="right"
          />
        ),
        cell: ({ getValue }) => <OverallScoreBadge value={getValue()} />,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
      }),
      columnHelper.accessor("wordCount", {
        header: ({ column }) => (
          <SortableHeader column={column} label="Words" align="right" />
        ),
        cell: ({ getValue }) => getValue(),
        meta: NUMERIC_META,
      }),
      columnHelper.accessor("kind", {
        header: "Type",
        cell: ({ getValue }) => <KindBadge kind={getValue()} />,
        enableSorting: false,
        meta: {
          headerClassName: "text-center",
          cellClassName: "whitespace-nowrap text-center",
        },
      }),
    ],
    [selectAnchorRef],
  );

  const table = useAppTable({
    data: rows,
    columns,
    state: { rowSelection, sorting },
    onRowSelectionChange,
    onSortingChange,
    getRowId: (row) => row.keyword,
    enableRowSelection: true,
    manualSorting: true,
  });

  return (
    <div className="flex-1 min-h-0">
      <AppDataTable
        table={table}
        className="table table-xs min-w-max md:w-full"
        wrapperClassName="h-full overflow-auto"
        getRowProps={(row) => ({
          className: `border-b border-base-200 hover:bg-base-200/50 ${
            highlightedKeyword === row.original.keyword
              ? "bg-primary/5 border-l-2 border-l-primary"
              : ""
          }`,
        })}
      />
    </div>
  );
}
