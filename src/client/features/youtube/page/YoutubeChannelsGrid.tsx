import { Eye, Flame, Users, Video } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { formatCompactNumber } from "@/client/features/keywords/utils";
import { formatChannelMultiplier } from "@/shared/youtube-columns";
import type { YoutubeChannelRow } from "@/shared/youtube-channels";
import type { YoutubeChannelView } from "@/types/schemas/youtube";
import type { YoutubeVideosResult } from "@/types/youtube";

// SEO Forge: the Channels sub-tab, laid out like the Videos grid. One card per
// distinct channel behind the ranking videos; "Breakout" narrows to channels
// whose ranking video punched far above the channel's usual reach.

const BREAKOUT_HELP =
  "A channel breaks out on this keyword when a ranking video has at least 3x the channel's median views, or, without the YouTube Data API key, more views than the channel has subscribers.";

function ChannelAvatar({ channel }: { channel: YoutubeChannelRow }) {
  if (channel.channelLogoUrl) {
    return (
      <img
        src={channel.channelLogoUrl}
        alt=""
        loading="lazy"
        className="size-12 shrink-0 rounded-full bg-base-200 object-cover"
      />
    );
  }
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
      {channel.channelName.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

function ChannelCard({ channel }: { channel: YoutubeChannelRow }) {
  return (
    <article
      className="flex flex-col gap-3 rounded-xl border border-base-300 bg-base-100 p-4"
      data-testid="youtube-channel-card"
    >
      <div className="flex items-start gap-3">
        <ChannelAvatar channel={channel} />
        <div className="min-w-0 flex-1">
          {channel.channelUrl ? (
            <SafeExternalLink
              url={channel.channelUrl}
              label={channel.channelName}
              className="inline-flex items-center gap-1 truncate text-sm font-medium hover:text-primary"
            />
          ) : (
            <span className="block truncate text-sm font-medium">
              {channel.channelName}
            </span>
          )}
          <p className="text-xs text-base-content/60">
            {channel.videoCount} ranking video
            {channel.videoCount === 1 ? "" : "s"}
            {" · "}best rank #{channel.bestRank}
          </p>
        </div>
        {channel.breakout ? (
          <span
            className="badge badge-sm badge-success gap-1 font-semibold"
            title={BREAKOUT_HELP}
          >
            <Flame className="size-3" />
            Breakout
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex items-center gap-1" title="Subscribers">
          <Users className="size-3.5 text-base-content/50" />
          <span className="font-semibold tabular-nums">
            {channel.subscribersCount == null
              ? "—"
              : formatCompactNumber(channel.subscribersCount)}
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          title="Views across this channel's ranking videos"
        >
          <Eye className="size-3.5 text-base-content/50" />
          <span className="font-semibold tabular-nums">
            {formatCompactNumber(channel.viewsCount)}
          </span>
        </div>
        <div
          className="flex items-center gap-1"
          title="Best video's views relative to the channel's median recent upload"
        >
          <Video className="size-3.5 text-base-content/50" />
          <span className="font-semibold tabular-nums">
            {formatChannelMultiplier(channel.maxChannelMultiplier)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function YoutubeChannelsGrid({
  data,
  view,
  onViewChange,
}: {
  data: YoutubeVideosResult;
  view: YoutubeChannelView;
  onViewChange: (view: YoutubeChannelView) => void;
}) {
  const breakoutCount = data.channels.filter((c) => c.breakout).length;
  const channels =
    view === "breakout"
      ? data.channels.filter((c) => c.breakout)
      : data.channels;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
        <div className="join" role="group" aria-label="Channel view">
          <button
            type="button"
            className={`btn btn-xs join-item ${view === "all" ? "btn-active" : "btn-ghost"}`}
            aria-pressed={view === "all"}
            onClick={() => onViewChange("all")}
          >
            All channels ({data.channels.length})
          </button>
          <button
            type="button"
            className={`btn btn-xs join-item ${view === "breakout" ? "btn-active" : "btn-ghost"}`}
            aria-pressed={view === "breakout"}
            onClick={() => onViewChange("breakout")}
            title={BREAKOUT_HELP}
          >
            Breakout ({breakoutCount})
          </button>
        </div>
        <span>
          Channels behind the top {data.rows.length} videos for{" "}
          <span className="font-medium text-base-content">
            "{data.keyword}"
          </span>
        </span>
      </div>
      {channels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-sm text-base-content/50">
          {view === "breakout"
            ? "No channel broke out on this keyword yet."
            : "No channels found for this keyword."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.channelId} channel={channel} />
          ))}
        </div>
      )}
    </div>
  );
}
