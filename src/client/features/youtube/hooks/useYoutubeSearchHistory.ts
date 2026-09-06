import { z } from "zod";
import { useLocalHistoryStore } from "@/client/hooks/useLocalHistoryStore";
import { jsonCodec } from "@/shared/json";
import { youtubeTabs, type YoutubeTab } from "@/types/schemas/youtube";

// SEO Forge: recent YouTube searches per project, kept apart from Keyword
// Research's history so the two tabs do not offer each other's queries.

type YoutubeSearchHistoryItem = {
  keyword: string;
  locationCode: number;
  locationName: string;
  /** Which sub-tab the keyword was viewed in (keywords, videos, channels). */
  tab: YoutubeTab;
  timestamp: number;
};

const historyCodec = jsonCodec(
  z.array(
    z.object({
      keyword: z.string(),
      locationCode: z.number(),
      locationName: z.string(),
      // Entries written before the tab was recorded were keyword searches.
      tab: z.enum(youtubeTabs).default("keywords"),
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
      existing.locationCode === next.locationCode &&
      existing.tab === next.tab,
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
