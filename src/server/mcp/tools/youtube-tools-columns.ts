import type { McpTableColumn } from "@/server/mcp/table";
import {
  YOUTUBE_CHANNEL_COLUMNS,
  YOUTUBE_KEYWORD_COLUMNS,
  YOUTUBE_VIDEO_COLUMNS,
} from "@/shared/youtube-columns";

// SEO Forge: the shared column definitions rendered through upstream's MCP
// table formatter, so the text tables match the UI column for column.

/** Shared column definitions rendered through the MCP table formatter. */
function toMcpColumns<Row>(
  columns: readonly { label: string; format: (row: Row) => string }[],
): McpTableColumn<Row>[] {
  return columns.map((column) => ({
    header: column.label,
    value: (row) => column.format(row),
  }));
}

export const KEYWORD_COLUMNS = toMcpColumns(YOUTUBE_KEYWORD_COLUMNS);
export const VIDEO_COLUMNS = toMcpColumns(YOUTUBE_VIDEO_COLUMNS);
export const CHANNEL_COLUMNS = toMcpColumns(YOUTUBE_CHANNEL_COLUMNS);
