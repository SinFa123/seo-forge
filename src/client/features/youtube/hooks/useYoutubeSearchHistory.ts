import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";

// SEO Forge: recent YouTube searches per project, kept apart from Keyword
// Research's history so the two tabs do not offer each other's queries.

type YoutubeSearchHistoryItem = {
  keyword: string;
  locationCode: number;
  locationName: string;
  timestamp: number;
};

const historyCodec = jsonCodec(
  z.array(
    z.object({
      keyword: z.string(),
      locationCode: z.number(),
      locationName: z.string(),
      timestamp: z.number(),
    }),
  ),
);

export function useYoutubeSearchHistory(projectId: string) {
  const { history, isLoaded, addItem, removeItem } = useLocalHistoryStore<
    YoutubeSearchHistoryItem,
    Omit<YoutubeSearchHistoryItem, "timestamp">
  >({
    storageKey: `youtube-search-history:${projectId}`,
    maxItems: 20,
    parse: (raw) => {
      const parsed = historyCodec.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    isSameItem: (existing, next) =>
      existing.keyword === next.keyword &&
      existing.locationCode === next.locationCode,
    createItem: (item) => ({ ...item, timestamp: Date.now() }),
    getItemKey: (item) => item.timestamp,
  });

  return {
    history,
    historyLoaded: isLoaded,
    addSearch: addItem,
    removeHistoryItem: removeItem,
  };
}
