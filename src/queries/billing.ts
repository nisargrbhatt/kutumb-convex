import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	cancelSubscriptionFn,
	getActiveOrgBillingFn,
	getBillingFn,
	getTrialSummaryFn,
	openPortalFn,
	resumeSubscriptionFn,
	startCheckoutFn,
	syncBillingFn,
} from "@/server/billing";
import { billingKeys } from "./keys";
import { toastMutationError } from "./mutation";

/** Owner-only. */
export const trialSummaryQuery = (orgId: string) =>
	queryOptions({
		queryKey: billingKeys.trial(orgId),
		queryFn: () => getTrialSummaryFn(),
	});

/** While Dodo confirms a payment the webhook flips the row: re-read until it settles. */
const PENDING_POLL_MS = 5_000;

/** Owner-only billing page data. */
export const billingPageQuery = (orgId: string) =>
	queryOptions({
		queryKey: billingKeys.page(orgId),
		queryFn: () => getBillingFn(),
		refetchInterval: (q) => (q.state.data?.access.state === "pending" ? PENDING_POLL_MS : false),
	});

/**
 * Active org's billing, any role (gate, `/locked`, banner via `bannerFor`). Cached briefly so the
 * `_community` gate isn't a round trip per navigation; a `Locked` error anywhere invalidates it
 * (see `router.tsx`). Polls while a payment is pending.
 */
export const activeOrgBillingQuery = (orgId: string) =>
	queryOptions({
		queryKey: billingKeys.access(orgId),
		queryFn: () => getActiveOrgBillingFn(),
		staleTime: 30_000,
		refetchInterval: (q) =>
			q.state.data?.access.state === "pending" ? PENDING_POLL_MS : false,
	});

/** Owner-only: leave for Dodo's customer portal (add / update card). */
export function useOpenPortal(returnTo: "billing" | "locked" = "billing") {
	return useMutation({
		mutationFn: () => openPortalFn({ data: { returnTo } }),
		onSuccess: ({ url }) => window.location.assign(url),
		onError: toastMutationError("Billing", "Couldn't open the billing portal. Try again."),
	});
}

/** Owner-only, ended sub: leave for a Dodo checkout to re-subscribe. */
export function useStartCheckout() {
	return useMutation({
		mutationFn: () => startCheckoutFn(),
		onSuccess: ({ url }) => window.location.assign(url),
		onError: toastMutationError("Billing", "Couldn't open checkout. Try again."),
	});
}

function useInvalidateBilling(orgId: string) {
	const qc = useQueryClient();
	return () => qc.invalidateQueries({ queryKey: billingKeys.all(orgId) });
}

export function useCancelSubscription(orgId: string) {
	const invalidate = useInvalidateBilling(orgId);
	return useMutation({
		mutationFn: () => cancelSubscriptionFn(),
		onSuccess: invalidate,
		onError: toastMutationError("Billing", "Couldn't cancel the subscription. Try again."),
	});
}

export function useResumeSubscription(orgId: string) {
	const invalidate = useInvalidateBilling(orgId);
	return useMutation({
		mutationFn: () => resumeSubscriptionFn(),
		onSuccess: invalidate,
		onError: toastMutationError("Billing", "Couldn't resume the subscription. Try again."),
	});
}

/** Back from Dodo (`?from=dodo`): pull the sub now instead of waiting for the webhook. */
export function useSyncBilling(orgId: string) {
	const invalidate = useInvalidateBilling(orgId);
	return useMutation({
		mutationFn: () => syncBillingFn(),
		onSettled: invalidate,
	});
}
