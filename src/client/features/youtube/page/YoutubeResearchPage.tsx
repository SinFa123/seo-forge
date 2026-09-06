import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useResolvedKeywordLocation } from "@/client/features/keywords/state/keywordControllerInternals";
import { LOCATIONS } from "@/client/features/keywords/utils";
import { captureClientEvent } from "@/client/lib/posthog";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { YoutubeKeywordKind, YoutubeKeywordRow } from "@/shared/youtube";
import type {
  YoutubeSortDir,
  YoutubeSortField,
  YoutubeTab,
} from "@/types/schemas/youtube";
import { useYoutubeResearchData } from "../hooks/useYoutubeResearchData";
import { useSaveYoutubeKeywordsMutation } from "../hooks/useYoutubeSavedKeywords";
import { useYoutubeSearchForm } from "../hooks/useYoutubeSearchForm";
import { useYoutubeSearchHistory } from "../hooks/useYoutubeSearchHistory";
import { useYoutubeVideosData } from "../hooks/useYoutubeVideosData";
import {
  DEFAULT_YOUTUBE_SEARCH,
  type YoutubeNavigate,
  type YoutubeRouteState,
  type YoutubeSearchUpdate,
} from "../youtubeRouteState";
import { filterYoutubeRows, sortYoutubeRows } from "../youtubeRows";
import {
  YoutubeNoResultsState,
  YoutubeSearchHistoryState,
} from "./YoutubeEmptyState";
import { YoutubeFetchedLine as FetchedLine } from "./YoutubeFetchedLine";
import { YoutubeKeywordsResults } from "./YoutubeKeywordsResults";
import { YoutubeLoadingState } from "./YoutubeLoadingState";
import { YoutubeOverviewCards } from "./YoutubeOverviewCards";
import { YoutubeSavedKeywords } from "./YoutubeSavedKeywords";
import { YoutubeSearchBar } from "./YoutubeSearchBar";
import { YoutubeChannelsGrid } from "./YoutubeChannelsGrid";
import { ErrorCard, VideosContent } from "./YoutubeResultStates";

// SEO Forge: the YouTube Research tab. Laid out like Keyword Research (header,
// search card, results) with three URL-driven sub-tabs: Keywords, Videos,
// Saved. All numbers come from the YouTube service; nothing is computed here.

type Props = {
  projectId: string;
  routeState: YoutubeRouteState;
  navigate: YoutubeNavigate;
};

const TABS: Array<{ value: YoutubeTab; label: string }> = [
  { value: "keywords", label: "Keywords" },
  { value: "videos", label: "Videos" },
  { value: "channels", label: "Channels" },
  { value: "saved", label: "Saved" },
];

export function YoutubeResearchPage({
  projectId,
  routeState,
  navigate,
}: Props) {
  const { locationCode, displayedLocationCode, setPreferredLocationCode } =
    useResolvedKeywordLocation({
      projectId,
      locationCode: routeState.locationCode,
    });

  const setSearchParams = useCallback(
    (updates: YoutubeSearchUpdate) => {
      navigate({
        search: (prev) => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const history = useYoutubeSearchHistory(projectId);
  const { addSearch } = history;
  const onResearchComplete = useCallback(
    (request: { keyword: string }) => {
      addSearch({
        keyword: request.keyword,
        locationCode: displayedLocationCode,
        locationName: LOCATIONS[displayedLocationCode] || "Unknown",
        tab: "keywords",
      });
    },
    [addSearch, displayedLocationCode],
  );

  const research = useYoutubeResearchData(
    {
      projectId,
      keyword: routeState.keyword,
      locationCode,
      languageCode: routeState.languageCode,
      serpRowLimit: routeState.serpRowLimit,
    },
    onResearchComplete,
  );
  const videos = useYoutubeVideosData({
    projectId,
    keyword: routeState.keyword,
    locationCode,
    languageCode: routeState.languageCode,
    active: routeState.tab === "videos" || routeState.tab === "channels",
  });
  // Videos and Channels views are remembered too, so the recent list says
  // which view of a keyword was open, not only that it was searched.
  const videosKeyword = videos.data?.keyword;
  useEffect(() => {
    if (!videosKeyword) return;
    if (routeState.tab !== "videos" && routeState.tab !== "channels") return;
    addSearch({
      keyword: videosKeyword,
      locationCode: displayedLocationCode,
      locationName: LOCATIONS[displayedLocationCode] || "Unknown",
      tab: routeState.tab,
    });
  }, [addSearch, displayedLocationCode, routeState.tab, videosKeyword]);

  const form = useYoutubeSearchForm(
    {
      keyword: routeState.keyword,
      locationCode: displayedLocationCode,
      serpRowLimit: routeState.serpRowLimit,
    },
    (value) => {
      setPreferredLocationCode(value.locationCode);
      setSearchParams({
        q: value.keyword.trim(),
        loc: value.locationCode,
        lang: undefined,
        rows: value.serpRowLimit,
        tab: routeState.tab === "saved" ? undefined : routeState.tab,
        kind: undefined,
      });
    },
  );

  // Selection is per search; a new keyword or market clears it.
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(
    () => new Set(),
  );
  const searchKey = `${routeState.keyword}|${locationCode}|${routeState.serpRowLimit}`;
  const previousSearchKeyRef = useRef(searchKey);
  useEffect(() => {
    if (previousSearchKeyRef.current === searchKey) return;
    previousSearchKeyRef.current = searchKey;
    setSelectedKeywords(new Set());
  }, [searchKey]);

  const tableRows = useMemo<YoutubeKeywordRow[]>(() => {
    if (!research.data) return [];
    const {
      medianViewsPerHour: _vph,
      videoCount: _count,
      ...seedRow
    } = research.data.seed;
    return sortYoutubeRows(
      filterYoutubeRows([seedRow, ...research.data.rows], routeState.kind),
      routeState.sortField,
      routeState.sortDir,
    );
  }, [
    research.data,
    routeState.kind,
    routeState.sortDir,
    routeState.sortField,
  ]);

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const saveMutation = useSaveYoutubeKeywordsMutation(projectId);
  const confirmSave = () => {
    const rows = tableRows.filter((row) => selectedKeywords.has(row.keyword));
    saveMutation.mutate(
      { rows, locationCode, languageCode: routeState.languageCode },
      {
        onSuccess: (result) => {
          captureClientEvent("youtube_research:save", {
            keyword_count: result.saved,
          });
          toast.success(
            `Saved ${result.saved} keyword${result.saved === 1 ? "" : "s"}`,
          );
          setShowSaveDialog(false);
          setSelectedKeywords(new Set());
        },
        onError: (error) => {
          toast.error(getStandardErrorMessage(error, "Save failed."));
        },
      },
    );
  };

  const showRecentSearches = () => {
    navigate({ search: () => ({}), replace: true });
  };
  const setTab = (tab: YoutubeTab) => {
    setSearchParams({
      tab: tab === DEFAULT_YOUTUBE_SEARCH.tab ? undefined : tab,
    });
  };
  const setKind = (kind: YoutubeKeywordKind | undefined) => {
    setSearchParams({ kind });
  };
  const setSort = (sortField: YoutubeSortField, sortDir: YoutubeSortDir) => {
    setSearchParams({
      sort: sortField === DEFAULT_YOUTUBE_SEARCH.sort ? undefined : sortField,
      order: sortDir === DEFAULT_YOUTUBE_SEARCH.order ? undefined : sortDir,
    });
  };

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold">YouTube Research</h1>
          <p className="text-sm text-base-content/70">
            Estimate YouTube search demand, size up the competition, and see
            which videos rank.
          </p>
        </div>

        <YoutubeSearchBar form={form} />

        {research.hasSearched ? (
          <button
            type="button"
            data-testid="youtube-research-recent-searches"
            className="btn btn-ghost btn-sm w-fit gap-2 px-0 text-base-content/70 hover:bg-transparent"
            onClick={showRecentSearches}
          >
            <ArrowLeft className="size-4" />
            Recent searches
          </button>
        ) : null}

        <div role="tablist" className="tabs tabs-border w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={routeState.tab === tab.value}
              className={`tab ${routeState.tab === tab.value ? "tab-active" : ""}`}
              onClick={() => setTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {routeState.tab === "saved" ? (
          <YoutubeSavedKeywords projectId={projectId} />
        ) : !research.hasSearched ? (
          <YoutubeSearchHistoryState projectId={projectId} {...history} />
        ) : routeState.tab === "channels" ? (
          <VideosContent
            isLoading={videos.isLoading}
            error={videos.error}
            retry={() => void videos.retry()}
            data={videos.data}
            isRefreshing={videos.isRefreshing}
            onRefresh={() => videos.refresh()}
            render={(data) => (
              <YoutubeChannelsGrid
                data={data}
                view={routeState.channelView}
                onViewChange={(view) =>
                  setSearchParams({
                    cv: view === DEFAULT_YOUTUBE_SEARCH.cv ? undefined : view,
                  })
                }
              />
            )}
          />
        ) : routeState.tab === "videos" ? (
          <VideosContent
            isLoading={videos.isLoading}
            error={videos.error}
            retry={() => void videos.retry()}
            data={videos.data}
            isRefreshing={videos.isRefreshing}
            onRefresh={() => videos.refresh()}
          />
        ) : research.isLoading ? (
          <YoutubeLoadingState />
        ) : research.error ? (
          <ErrorCard
            message={research.error}
            isCreditsError={research.errorCode === "INSUFFICIENT_CREDITS"}
            retry={() => void research.retry()}
          />
        ) : research.data && research.data.rows.length === 0 ? (
          <YoutubeNoResultsState
            keyword={routeState.keyword}
            locationCode={displayedLocationCode}
          />
        ) : research.data ? (
          <div className="flex flex-col gap-2">
            <FetchedLine
              label="Researched"
              fetchedAt={research.data.fetchedAt}
              cost="about 0.30 USD"
              isRefreshing={research.isRefreshing}
              onRefresh={() => research.refresh()}
            />
            <YoutubeOverviewCards overview={research.data.seed} />
            <YoutubeKeywordsResults
              rows={tableRows}
              totalRowCount={research.data.rows.length + 1}
              seedKeyword={research.data.seed.keyword}
              kind={routeState.kind}
              onKindChange={setKind}
              sortField={routeState.sortField}
              sortDir={routeState.sortDir}
              onSortChange={setSort}
              selectedKeywords={selectedKeywords}
              onSelectedKeywordsChange={setSelectedKeywords}
              onSave={() => {
                if (selectedKeywords.size === 0) {
                  toast.error("Select at least one keyword first");
                  return;
                }
                setShowSaveDialog(true);
              }}
            />
          </div>
        ) : null}

        {showSaveDialog ? (
          <div className="modal modal-open">
            <div className="modal-box">
              <h3 className="font-bold text-lg">
                Save {selectedKeywords.size} Keyword
                {selectedKeywords.size === 1 ? "" : "s"}
              </h3>
              <div className="py-4">
                <p className="text-base-content/70 text-sm">
                  These keywords and their current estimates will be saved to
                  this project's YouTube list.
                </p>
              </div>
              <div className="modal-action">
                <button
                  className="btn"
                  onClick={() => setShowSaveDialog(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={confirmSave}
                  disabled={saveMutation.isPending}
                >
                  Save
                </button>
              </div>
            </div>
            <div
              className="modal-backdrop"
              onClick={() => setShowSaveDialog(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
