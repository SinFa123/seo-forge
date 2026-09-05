import type { YoutubeKeywordRow, YoutubeVideoRow } from "./youtube";

// SEO Forge: column definitions and cell formatters shared by the UI tables,
// the MCP text tables, and the agent skill's output table, so every surface
// shows the same columns in the same order with the same formatting. Formulas
// live in ./youtube.ts.

/** Column definitions shared by the UI table, MCP text table, and CSV export. */
type YoutubeColumn<Row> = {
  key: keyof Row & string;
  label: string;
  align: "left" | "right";
  format: (row: Row) => string;
};

const formatInteger = (value: number | null) =>
  value == null ? "—" : Math.round(value).toLocaleString("en-US");

export const YOUTUBE_KEYWORD_COLUMNS: readonly YoutubeColumn<YoutubeKeywordRow>[] =
  [
    {
      key: "keyword",
      label: "Keyword",
      align: "left",
      format: (r) => r.keyword,
    },
    {
      key: "searchVolume",
      label: "Search volume (est.)",
      align: "right",
      format: (r) =>
        r.searchVolume == null ? "< 10" : formatInteger(r.searchVolume),
    },
    {
      key: "volumeConfidence",
      label: "Confidence",
      align: "left",
      format: (r) => r.volumeConfidence,
    },
    {
      key: "competition",
      label: "Competition",
      align: "right",
      format: (r) => formatInteger(r.competition),
    },
    {
      key: "overallScore",
      label: "Overall",
      align: "right",
      format: (r) => formatInteger(r.overallScore),
    },
    {
      key: "wordCount",
      label: "Words",
      align: "right",
      format: (r) => String(r.wordCount),
    },
    { key: "kind", label: "Type", align: "left", format: (r) => r.kind },
  ];

export const YOUTUBE_VIDEO_COLUMNS: readonly YoutubeColumn<YoutubeVideoRow>[] =
  [
    { key: "rank", label: "#", align: "right", format: (r) => String(r.rank) },
    { key: "title", label: "Title", align: "left", format: (r) => r.title },
    {
      key: "channelName",
      label: "Channel",
      align: "left",
      format: (r) => r.channelName ?? "—",
    },
    {
      key: "publishedLabel",
      label: "Published",
      align: "left",
      format: (r) => r.publishedLabel ?? r.publishedAt?.slice(0, 10) ?? "—",
    },
    {
      key: "viewsCount",
      label: "Views",
      align: "right",
      format: (r) => formatInteger(r.viewsCount),
    },
    {
      key: "viewsPerHour",
      label: "Avg views/hr",
      align: "right",
      format: (r) => formatViewsPerHour(r.viewsPerHour),
    },
    {
      key: "channelMultiplier",
      label: "vs channel",
      align: "right",
      format: (r) => formatChannelMultiplier(r.channelMultiplier),
    },
    {
      key: "subscribersCount",
      label: "Subscribers",
      align: "right",
      format: (r) => formatInteger(r.subscribersCount),
    },
    {
      key: "durationSeconds",
      label: "Length",
      align: "right",
      format: (r) => formatDuration(r.durationSeconds),
    },
    {
      key: "isShorts",
      label: "Shorts",
      align: "left",
      format: (r) => (r.isShorts ? "yes" : "no"),
    },
    { key: "url", label: "URL", align: "left", format: (r) => r.url },
  ];

function formatViewsPerHour(value: number | null): string {
  if (value == null) return "—";
  if (value >= 100) return formatInteger(value);
  return value.toFixed(1);
}

export function formatChannelMultiplier(value: number | null): string {
  if (value == null) return "—";
  return value >= 10 ? `${Math.round(value)}x` : `${value.toFixed(1)}x`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
