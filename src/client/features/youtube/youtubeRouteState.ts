import type { YoutubeKeywordKind } from "@/shared/youtube";
import {
  YOUTUBE_SERP_ROW_LIMIT_DEFAULT,
  type YoutubeChannelView,
  type YoutubeSearchParams,
  type YoutubeSortDir,
  type YoutubeSortField,
  type YoutubeTab,
} from "@/types/schemas/youtube";

// SEO Forge: the URL is the page state for /p/$projectId/youtube (keyword,
// market, sub-tab, sort, row-SERP budget, kind filter), mirroring the domain
// route. Defaults are stripped from the URL by the route middleware.

/** Row-SERP budgets offered in the search bar; each row SERP is a paid call. */
export const YOUTUBE_ROW_LIMITS = [0, 10, 30, 50, 100] as const;

export const DEFAULT_YOUTUBE_SEARCH = {
  q: "",
  loc: undefined,
  lang: undefined,
  tab: "keywords",
  sort: "searchVolume",
  order: "desc",
  rows: YOUTUBE_SERP_ROW_LIMIT_DEFAULT,
  kind: undefined,
  cv: "all",
} as const;

export type YoutubeRouteState = {
  keyword: string;
  locationCode: number | undefined;
  languageCode: string | undefined;
  tab: YoutubeTab;
  sortField: YoutubeSortField;
  sortDir: YoutubeSortDir;
  serpRowLimit: number;
  kind: YoutubeKeywordKind | undefined;
  channelView: YoutubeChannelView;
};

export type YoutubeSearchUpdate = Partial<YoutubeSearchParams>;

export type YoutubeNavigate = (args: {
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  replace: boolean;
}) => void;

export function getYoutubeRouteState(
  search: YoutubeSearchParams,
): YoutubeRouteState {
  return {
    keyword: search.q?.trim() ?? "",
    locationCode: search.loc,
    languageCode: search.lang,
    tab: search.tab ?? DEFAULT_YOUTUBE_SEARCH.tab,
    sortField: search.sort ?? DEFAULT_YOUTUBE_SEARCH.sort,
    sortDir: search.order ?? DEFAULT_YOUTUBE_SEARCH.order,
    serpRowLimit: search.rows ?? DEFAULT_YOUTUBE_SEARCH.rows,
    kind: search.kind,
    channelView: search.cv ?? DEFAULT_YOUTUBE_SEARCH.cv,
  };
}
