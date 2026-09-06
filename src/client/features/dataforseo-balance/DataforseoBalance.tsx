import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { useDataforseoBalance } from "./useDataforseoBalance";

// SEO Forge: sidebar footer row showing the operator's DataForSEO balance. It
// refreshes after each paid job completes (see invalidateDataforseoBalance)
// and on demand; hosted deployments (credits, not a shared key) hide it.
export function DataforseoBalance() {
  const query = useDataforseoBalance();
  if (isHostedClientAuthMode()) return null;

  const balance = query.data?.balance;
  const label = query.isPending
    ? "…"
    : balance == null
      ? "unavailable"
      : `$${balance.toFixed(2)}`;

  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-base-content/70"
      data-testid="dataforseo-balance"
      title="DataForSEO account balance. Updates after each research job."
    >
      <Wallet className="h-4 w-4 shrink-0" />
      <span className="truncate">DataForSEO</span>
      <span className="ml-auto font-medium tabular-nums text-base-content">
        {label}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-square -mr-1"
        aria-label="Refresh DataForSEO balance"
        onClick={() => void query.refetch()}
        disabled={query.isFetching}
      >
        {query.isFetching ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RefreshCw className="size-3" />
        )}
      </button>
    </div>
  );
}
