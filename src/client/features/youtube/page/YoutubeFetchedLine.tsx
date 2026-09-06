import { Loader2, RefreshCw } from "lucide-react";

/**
 * Results are kept until refreshed (single-operator deployment), so every
 * result states when it was bought and offers to buy it again.
 */
export function YoutubeFetchedLine({
  label,
  fetchedAt,
  cost,
  isRefreshing,
  onRefresh,
}: {
  label: string;
  fetchedAt: string;
  cost: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) {
  const date = new Date(fetchedAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60"
      data-testid="youtube-fetched-line"
    >
      <span>
        {label} {date}. Kept until you refresh.
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-xs gap-1 px-1 text-base-content/70"
        onClick={onRefresh}
        disabled={isRefreshing}
        title={`Buy this research again (${cost})`}
      >
        {isRefreshing ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        Refresh
      </button>
    </div>
  );
}
