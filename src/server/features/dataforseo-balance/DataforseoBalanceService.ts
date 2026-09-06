import { fetchUserData } from "@/server/lib/dataforseo/appendix";

// SEO Forge: the operator's DataForSEO balance for the sidebar. Reads the free
// appendix/user_data endpoint (nothing to meter). Provider failures degrade to
// `null` so the sidebar never breaks navigation over a status widget.

type DataforseoBalance = {
  /** Remaining balance in USD, null when unknown. */
  balance: number | null;
  fetchedAt: string;
};

async function getBalance(): Promise<DataforseoBalance> {
  try {
    const data = await fetchUserData();
    return {
      balance: data?.money?.balance ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("dataforseo-balance.failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { balance: null, fetchedAt: new Date().toISOString() };
  }
}

export const DataforseoBalanceService = { getBalance } as const;
