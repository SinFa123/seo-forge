import { DifficultyBadge } from "@/client/features/domain/components/DifficultyBadge";
import { formatNumber } from "@/client/features/keywords/utils";
import type { YoutubeResearchOverview } from "@/shared/youtube";
import { formatViewsPerHour } from "@/shared/youtube-columns";
import { ConfidenceBadge } from "../components/ConfidenceBadge";
import { OverallScoreBadge } from "../components/ScoreBadge";

// SEO Forge: the seed's overview strip, laid out like Keyword Research's
// OverviewStats so the two tabs read the same at a glance.
export function YoutubeOverviewCards({
  overview,
}: {
  overview: YoutubeResearchOverview;
}) {
  return (
    <div
      className="shrink-0 bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 flex flex-col gap-2 md:flex-row md:items-center md:gap-4 min-h-[48px]"
      data-testid="youtube-overview"
    >
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="font-bold text-base truncate max-w-[240px] capitalize">
          {overview.keyword}
        </span>
        <span title="Overall opportunity (0-100, higher is better)">
          <OverallScoreBadge value={overview.overallScore} />
        </span>
      </div>

      <div className="hidden md:block w-px h-6 bg-base-300 shrink-0" />

      <div className="flex items-center gap-x-4 gap-y-1 text-sm flex-wrap min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Est. vol</span>
          <span className="font-semibold tabular-nums">
            {overview.searchVolume == null
              ? "< 10"
              : formatNumber(overview.searchVolume)}
          </span>
          <ConfidenceBadge confidence={overview.volumeConfidence} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Comp</span>
          <DifficultyBadge value={overview.competition} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Avg views/hr</span>
          <span
            className="font-semibold tabular-nums"
            title="Median lifetime average views per hour across the top videos"
          >
            {formatViewsPerHour(overview.medianViewsPerHour)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-base-content/50">Top videos</span>
          <span className="font-semibold tabular-nums">
            {overview.videoCount}
          </span>
        </div>
      </div>
    </div>
  );
}
