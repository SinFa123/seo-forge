import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  getSavedYoutubeKeywords,
  removeSavedYoutubeKeywords,
  saveYoutubeKeywords,
} from "@/serverFunctions/youtube";
import type { GetSavedYoutubeKeywordsInput } from "@/types/schemas/youtube";
import type { SaveYoutubeKeywordsInput } from "@/types/schemas/youtube";

const savedKeywordsQueryKey = (projectId: string) => [
  "youtubeSavedKeywords",
  projectId,
];

export function useYoutubeSavedKeywordsQuery(
  input: GetSavedYoutubeKeywordsInput,
) {
  return useQuery({
    queryKey: [...savedKeywordsQueryKey(input.projectId), input],
    queryFn: () => getSavedYoutubeKeywords({ data: input }),
    placeholderData: keepPreviousData,
  });
}

export function useSaveYoutubeKeywordsMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<SaveYoutubeKeywordsInput, "projectId">) =>
      saveYoutubeKeywords({ data: { ...data, projectId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: savedKeywordsQueryKey(projectId),
      });
    },
  });
}

export function useRemoveYoutubeKeywordsMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (savedKeywordIds: string[]) =>
      removeSavedYoutubeKeywords({ data: { projectId, savedKeywordIds } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: savedKeywordsQueryKey(projectId),
      });
    },
  });
}
