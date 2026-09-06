import { useQuery, type QueryClient } from "@tanstack/react-query";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getDataforseoBalance } from "@/serverFunctions/dataforseoBalance";

const QUERY_KEY = ["dataforseoBalance"] as const;

/**
 * Balance is read once and then only when something spends: paid features
 * call `invalidateDataforseoBalance` after a job completes so the sidebar
 * shows the post-job figure without polling.
 */
export function useDataforseoBalance() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => getDataforseoBalance(),
    enabled: !isHostedClientAuthMode(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function invalidateDataforseoBalance(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}
