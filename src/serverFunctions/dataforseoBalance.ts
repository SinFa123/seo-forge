import { createServerFn } from "@tanstack/react-start";
import { DataforseoBalanceService } from "@/server/features/dataforseo-balance/DataforseoBalanceService";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// SEO Forge: DataForSEO balance for the sidebar (self-hosted modes only; in
// hosted mode the key belongs to the operator and users buy credits instead).
export const getDataforseoBalance = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async () => {
    if (await isHostedServerAuthMode()) {
      return { balance: null, fetchedAt: new Date().toISOString() };
    }
    return DataforseoBalanceService.getBalance();
  });
