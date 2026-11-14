import { queryOptions, useMutation } from "@tanstack/react-query";
import { getTrialSummaryFn, openPortalFn } from "@/server/billing";
import { billingKeys } from "./keys";
import { toastMutationError } from "./mutation";

/** Owner-only. */
export const trialSummaryQuery = (orgId: string) =>
	queryOptions({
		queryKey: billingKeys.trial(orgId),
		queryFn: () => getTrialSummaryFn(),
	});

/** Owner-only: leave for Dodo's customer portal (add / update card). */
export function useOpenPortal() {
	return useMutation({
		mutationFn: () => openPortalFn(),
		onSuccess: ({ url }) => window.location.assign(url),
		onError: toastMutationError("Billing", "Couldn't open the billing portal. Try again."),
	});
}
