import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { BILLING_ROUTE } from "@/shared/billing";
import type { YoutubeVideosResult } from "@/types/youtube";
import { YoutubeFetchedLine as FetchedLine } from "./YoutubeFetchedLine";
import { YoutubeVideosLoadingState } from "./YoutubeLoadingState";
import { YoutubeVideosGrid } from "./YoutubeVideosGrid";

export function ErrorCard({
  message,
  isCreditsError,
  retry,
}: {
  message: string;
  isCreditsError: boolean;
  retry: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center pt-1">
      <div className="w-full max-w-xl rounded-xl border border-error/30 bg-error/10 p-5 text-error space-y-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm">{message}</p>
        </div>
        {isCreditsError ? (
          <Link to={BILLING_ROUTE} className="btn btn-sm">
            Go to Billing
          </Link>
        ) : (
          <button className="btn btn-sm" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function VideosContent({
  isLoading,
  error,
  retry,
  data,
  isRefreshing,
  onRefresh,
  render,
}: {
  isLoading: boolean;
  error: string | null;
  retry: () => void;
  data: YoutubeVideosResult | undefined;
  isRefreshing: boolean;
  onRefresh: () => void;
  render?: (data: YoutubeVideosResult) => ReactNode;
}) {
  if (isLoading) return <YoutubeVideosLoadingState />;
  if (error) {
    return <ErrorCard message={error} isCreditsError={false} retry={retry} />;
  }
  if (!data) return null;
  return (
    <div className="flex flex-col gap-2">
      <FetchedLine
        label="Fetched"
        fetchedAt={data.fetchedAt}
        cost="about 0.13 USD"
        isRefreshing={isRefreshing}
        onRefresh={onRefresh}
      />
      {render ? render(data) : <YoutubeVideosGrid data={data} />}
    </div>
  );
}
