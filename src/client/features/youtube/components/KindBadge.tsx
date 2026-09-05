import type { YoutubeKeywordKind } from "@/shared/youtube";

const LABELS: Record<YoutubeKeywordKind, string> = {
  seed: "Seed",
  related: "Related",
  matching: "Matching",
  question: "Question",
};

const STYLES: Record<YoutubeKeywordKind, string> = {
  seed: "badge-primary badge-outline",
  related: "badge-ghost",
  matching: "badge-ghost",
  question: "badge-ghost",
};

export function KindBadge({ kind }: { kind: YoutubeKeywordKind }) {
  return (
    <span className={`badge badge-xs ${STYLES[kind]} whitespace-nowrap`}>
      {LABELS[kind]}
    </span>
  );
}
