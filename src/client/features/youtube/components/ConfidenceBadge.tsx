import type { YoutubeVolumeConfidence } from "@/shared/youtube";

// SEO Forge: every estimated volume is labelled with its confidence.
const STYLES: Record<YoutubeVolumeConfidence, string> = {
  high: "border-success/40 text-success",
  medium: "border-warning/50 text-warning",
  low: "border-base-300 text-base-content/50",
};

const TITLES: Record<YoutubeVolumeConfidence, string> = {
  high: "High confidence: Google volume available and Google Trends shows YouTube interest for this keyword.",
  medium:
    "Medium confidence: estimated from Google volume alone (Trends is only checked for the seed).",
  low: "Low confidence: Google has no volume for this term, so no estimate is shown.",
};

export function ConfidenceBadge({
  confidence,
}: {
  confidence: YoutubeVolumeConfidence;
}) {
  return (
    <span
      className={`badge badge-xs badge-outline font-medium ${STYLES[confidence]}`}
      title={TITLES[confidence]}
    >
      {confidence}
    </span>
  );
}
