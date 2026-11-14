import { queryOptions } from "@tanstack/react-query";
import { getActiveOrgBillingFn } from "@/server/billingAccess";
import { billingKeys } from "./keys";

/**
 * Active org's billing, any role. Cached briefly so the `_community` gate isn't a round trip per
 * navigation; a `Locked` error anywhere invalidates it (see `router.tsx`).
 */
export const activeOrgBillingQuery = (orgId: string) =>
	queryOptions({
		queryKey: billingKeys.access(orgId),
		queryFn: () => getActiveOrgBillingFn(),
		staleTime: 30_000,
	});
