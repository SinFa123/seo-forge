import { Clock, Eye, Info, Users } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  formatCompactNumber,
  formatNumber,
} from "@/client/features/keywords/utils";
import type { YoutubeVideoRow } from "@/shared/youtube";
import {
  formatChannelMultiplier,
  formatDuration,
  formatViewsPerHour,
} from "@/shared/youtube-columns";
import type { YoutubeVideosResult } from "@/types/youtube";

// SEO Forge: the Videos sub-tab. One card per ranking video; the channel
// multiplier needs the optional YouTube Data API key and the hint explains
// that in the same voice as upstream's DataForSEO setup banner.

function DataApiHint({
  status,
}: {
  status: YoutubeVideosResult["dataApiStatus"];
}) {
  if (status === "ok") return null;
  return (
    <div className="alert alert-info" role="status">
      <Info className="size-4 shrink-0" />
      <span className="text-sm">
        {status === "not_configured"
          ? "Setup optional: add a YouTube Data API key (YOUTUBE_DATA_API_KEY) to the server environment to see how each video performs against its channel's usual views."
          : "The YouTube Data API returned an error for these channels, so the channel multiplier is unavailable right now."}
      </span>
    </div>
  );
}

function MultiplierBadge({ value }: { value: number | null }) {
  if (value == null) return null;
  const tone =
    value >= 10
      ? "badge-success"
      : value >= 2
        ? "badge-warning"
        : "badge-ghost";
  return (
    <span
      className={`badge badge-sm ${tone} font-semibold tabular-nums`}
      title="Views compared with the median of the channel's other recent uploads"
    >
      {formatChannelMultiplier(value)} vs channel
    </span>
  );
}

function VideoCard({ video }: { video: YoutubeVideoRow }) {
  return (
    <article
      className="flex flex-col overflow-hidden rounded-xl border border-base-300 bg-base-100"
      data-testid="youtube-video-card"
    >
      <div className="relative aspect-video bg-base-200">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        ) : null}
        <span className="absolute left-2 top-2 rounded-md bg-base-100/90 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
          #{video.rank}
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-neutral/85 px-1.5 py-0.5 text-xs font-medium text-neutral-content tabular-nums">
          {formatDuration(video.durationSeconds)}
        </span>
        {video.isShorts ? (
          <span className="absolute bottom-2 left-2 badge badge-sm badge-neutral">
            Shorts
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <SafeExternalLink
          url={video.url}
          label={video.title}
          className="line-clamp-2 inline-flex items-start gap-1 text-sm font-medium leading-5 hover:text-primary"
        />
        <div className="flex items-center justify-between gap-2 text-xs text-base-content/60">
          <span className="truncate">
            {video.channelName ?? "Unknown channel"}
          </span>
          <span className="shrink-0">{video.publishedLabel ?? "—"}</span>
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1" title="Views">
            <Eye className="size-3.5 text-base-content/50" />
            <span className="font-semibold tabular-nums">
              {formatCompactNumber(video.viewsCount)}
            </span>
          </div>
          <div
            className="flex items-center gap-1"
            title="Average views per hour since publish"
          >
            <Clock className="size-3.5 text-base-content/50" />
            <span className="font-semibold tabular-nums">
              {formatViewsPerHour(video.viewsPerHour)}
              <span className="font-normal text-base-content/50">/hr</span>
            </span>
          </div>
          <div className="flex items-center gap-1" title="Subscribers">
            <Users className="size-3.5 text-base-content/50" />
            <span className="font-semibold tabular-nums">
              {video.subscribersCount == null
                ? "—"
                : formatCompactNumber(video.subscribersCount)}
            </span>
          </div>
        </div>
        <MultiplierBadge value={video.channelMultiplier} />
      </div>
    </article>
  );
}

export function YoutubeVideosGrid({ data }: { data: YoutubeVideosResult }) {
  return (
    <div className="flex flex-col gap-3">
      <DataApiHint status={data.dataApiStatus} />
      <div className="flex items-center justify-between text-sm text-base-content/60">
        <span>
          Top {formatNumber(data.rows.length)} videos for{" "}
          <span className="font-medium text-base-content">
            "{data.keyword}"
          </span>
        </span>
        <span className="hidden sm:inline">
          Avg views/hr is the lifetime average since publish
        </span>
      </div>
      {data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-sm text-base-content/50">
          No videos rank for this keyword yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((video) => (
            <VideoCard key={video.videoId} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
