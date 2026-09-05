import { scoreTierClass } from "@/client/features/keywords/utils";

/**
 * Overall opportunity 0-100 (higher is better). Upstream's score tiers colour
 * high values as "hard", so the tier is taken from the inverted value: a high
 * opportunity renders green like an easy difficulty.
 */
export function OverallScoreBadge({ value }: { value: number | null }) {
  const tier = scoreTierClass(value == null ? null : 100 - value);
  return (
    <span
      className={`score-badge ${tier} inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums`}
    >
      {value == null ? "—" : value}
    </span>
  );
}
