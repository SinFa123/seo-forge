import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { researchYoutubeKeywords } from "@/serverFunctions/youtube";

// SEO Forge: paid research query. The URL drives it (see youtubeRouteState);
// TanStack Query owns fetch, cache, dedupe, and errors. Never refetches on
// focus or reconnect so a background tab cannot spend credits.

const YOUTUBE_RESEARCH_STALE_TIME_MS = 24 * 60 * 60 * 1000;

type YoutubeResearchRequest = {
  projectId: string;
  keyword: string;
  locationCode: number | undefined;
  languageCode: string | undefined;
  serpRowLimit: number;
};

function buildYoutubeResearchQueryKey(request: YoutubeResearchRequest) {
  return [
    "youtubeResearch",
    request.projectId,
    request.keyword,
    request.locationCode ?? null,
    request.languageCode ?? null,
    request.serpRowLimit,
  ];
}

export function useYoutubeResearchData(
  request: YoutubeResearchRequest,
  onComplete: (request: YoutubeResearchRequest) => void,
) {
  const hasSearched = request.keyword.length > 0;
  const queryKey = buildYoutubeResearchQueryKey(request);
  const query = useQuery({
    queryKey,
    queryFn: () => researchYoutubeKeywords({ data: request }),
    enabled: hasSearched,
    staleTime: YOUTUBE_RESEARCH_STALE_TIME_MS,
    gcTime: YOUTUBE_RESEARCH_STALE_TIME_MS,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const queryKeyString = JSON.stringify(queryKey);
  const handledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hasSearched || !query.isSuccess || !query.data) return;
    if (handledKeyRef.current === queryKeyString) return;
    handledKeyRef.current = queryKeyString;
    captureClientEvent("youtube_research:search_complete", {
      location_code: request.locationCode,
      serp_row_limit: request.serpRowLimit,
      result_count: query.data.rows.length,
      volume_confidence: query.data.seed.volumeConfidence,
    });
    onComplete(request);
  }, [
    hasSearched,
    onComplete,
    query.data,
    query.isSuccess,
    queryKeyString,
    request,
  ]);

  return {
    data: hasSearched ? query.data : undefined,
    hasSearched,
    isLoading: hasSearched && query.isPending,
    error:
      hasSearched && query.isError
        ? getStandardErrorMessage(query.error, "Research failed.")
        : null,
    errorCode: hasSearched && query.isError ? getErrorCode(query.error) : null,
    retry: query.refetch,
  };
}
