import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { invalidateDataforseoBalance } from "@/client/features/dataforseo-balance/useDataforseoBalance";
import { getYoutubeVideos } from "@/serverFunctions/youtube";

const YOUTUBE_VIDEOS_STALE_TIME_MS = 6 * 60 * 60 * 1000;

export function useYoutubeVideosData(request: {
  projectId: string;
  keyword: string;
  locationCode: number | undefined;
  languageCode: string | undefined;
  /** Only the Videos sub-tab pays for this query. */
  active: boolean;
}) {
  const enabled = request.active && request.keyword.length > 0;
  const queryClient = useQueryClient();
  const queryKey = [
    "youtubeVideos",
    request.projectId,
    request.keyword,
    request.locationCode ?? null,
    request.languageCode ?? null,
  ];
  const data = {
    projectId: request.projectId,
    keyword: request.keyword,
    locationCode: request.locationCode,
    languageCode: request.languageCode,
  };
  const query = useQuery({
    queryKey,
    queryFn: () => getYoutubeVideos({ data }),
    enabled,
    staleTime: YOUTUBE_VIDEOS_STALE_TIME_MS,
    gcTime: YOUTUBE_VIDEOS_STALE_TIME_MS,
    retry: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const refreshMutation = useMutation({
    mutationFn: () => getYoutubeVideos({ data: { ...data, refresh: true } }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      invalidateDataforseoBalance(queryClient);
    },
  });

  return {
    data: enabled ? query.data : undefined,
    isLoading: enabled && query.isPending,
    refresh: refreshMutation.mutate,
    isRefreshing: refreshMutation.isPending,
    error:
      enabled && query.isError
        ? getStandardErrorMessage(query.error, "Could not load videos.")
        : null,
    retry: query.refetch,
  };
}
