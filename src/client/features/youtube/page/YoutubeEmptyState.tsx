import { Link } from "@tanstack/react-router";
import { Clock, History, Search, X, Youtube } from "lucide-react";
import { LOCATIONS } from "@/client/features/keywords/utils";
import type { useYoutubeSearchHistory } from "../hooks/useYoutubeSearchHistory";

type HistoryState = ReturnType<typeof useYoutubeSearchHistory>;

export function YoutubeNoResultsState({
  keyword,
  locationCode,
}: {
  keyword: string;
  locationCode: number;
}) {
  return (
    <div className="pt-1">
      <div className="w-full max-w-2xl rounded-2xl border border-base-300 bg-base-100 p-6 md:p-8 text-center space-y-4 mx-auto">
        <Youtube className="size-10 mx-auto text-base-content/40" />
        <div className="space-y-2">
          <p className="text-lg font-semibold text-base-content">
            Not enough YouTube data for this keyword yet
          </p>
          <p className="text-sm text-base-content/70">
            We could not find keyword opportunities for
            <span className="font-medium text-base-content">
              {` "${keyword}" `}
            </span>
            in
            <span className="font-medium text-base-content">
              {` ${LOCATIONS[locationCode] || "this location"}`}
            </span>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

export function YoutubeSearchHistoryState({
  projectId,
  history,
  historyLoaded,
  removeHistoryItem,
}: HistoryState & { projectId: string }) {
  if (!historyLoaded) return null;

  return (
    <div className="space-y-4 pt-1">
      {history.length > 0 ? (
        <section className="rounded-2xl border border-base-300 bg-base-100 p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="size-4 text-base-content/45" />
              <span className="text-sm text-base-content/60">
                {history.length} recent search
                {history.length !== 1 ? "es" : ""}
              </span>
            </div>
          </div>
          <div className="grid gap-2">
            {history.map((item) => (
              <div
                key={item.timestamp}
                className="group flex items-center gap-2 rounded-lg border border-base-300 bg-base-100 p-2"
              >
                <Link
                  from="/p/$projectId/youtube"
                  to="/p/$projectId/youtube"
                  params={{ projectId }}
                  search={{ q: item.keyword, loc: item.locationCode }}
                  replace
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-base-200"
                >
                  <Clock className="size-4 shrink-0 text-base-content/40" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-base-content">
                      {item.keyword}
                    </p>
                    <p className="truncate text-sm text-base-content/60">
                      {item.locationName}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-base-content/40">
                    {new Date(item.timestamp).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 p-1"
                    aria-label={`Remove ${item.keyword} from recent searches`}
                    onClick={() => removeHistoryItem(item.timestamp)}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/50 space-y-3">
          <Search className="size-10 mx-auto opacity-40" />
          <p className="text-lg font-medium text-base-content/80">
            Enter a keyword to get started
          </p>
          <p className="text-sm max-w-md mx-auto">
            Search any keyword to estimate its YouTube demand, see how
            competitive the results are, and find related and question keywords.
          </p>
        </section>
      )}
    </div>
  );
}
