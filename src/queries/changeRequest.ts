import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type { ChangeRequestKind } from "@/domain/changeRequest";
import type { ReviewDecision } from "@/domain/profileChanges";
import { isAppError } from "@/domain/errors";
import {
	getMyRequests,
	getPendingChangeRequestCount,
	getPendingCreateRequest,
	getPendingForProfile,
	getReviewQueue,
	getUnseenRequestCount,
	markMyRequestsSeen,
	reviewChangeRequest,
	withdrawChangeRequest,
} from "@/server/changeRequest";
import { changeRequestKeys } from "./keys";
import { toastMutationError, useInvalidateProfileChange } from "./mutation";

/** Owner/admin: pending create request of a draft (detail page Accept / Reject). */
export const pendingCreateRequestQuery = (orgId: string, profileId: string) =>
	queryOptions({
		queryKey: [...changeRequestKeys.forProfile(orgId, profileId), "create"] as const,
		queryFn: () => getPendingCreateRequest({ data: { profileId } }),
	});

/** Badges: 60 s fresh, refetch on focus, no polling (spec § Query keys + badges). */
const BADGE_STALE_MS = 60_000;

/** Owner/admin Reviews queue. */
export const reviewQueueQuery = (orgId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.queue(orgId),
		queryFn: () => getReviewQueue(),
	});

/** Owner/admin Reviews nav badge. */
export const pendingCountQuery = (orgId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.pendingCount(orgId),
		queryFn: () => getPendingChangeRequestCount(),
		staleTime: BADGE_STALE_MS,
		refetchOnWindowFocus: true,
	});

/** My requests page. */
export const myRequestsQuery = (orgId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.mine(orgId),
		queryFn: () => getMyRequests(),
	});

/** My requests nav badge. */
export const unseenCountQuery = (orgId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.unseenCount(orgId),
		queryFn: () => getUnseenRequestCount(),
		staleTime: BADGE_STALE_MS,
		refetchOnWindowFocus: true,
	});

/** Pending banner on profile detail (`scope`: all for owner/admin, mine otherwise). */
export const pendingForProfileQuery = (orgId: string, profileId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.forProfile(orgId, profileId),
		queryFn: () => getPendingForProfile({ data: { profileId } }),
	});

/** My requests visit: mark resolved requests seen, then refresh the badge. */
export function useMarkRequestsSeen(orgId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => markMyRequestsSeen(),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: changeRequestKeys.unseenCount(orgId) }),
	});
}

/** Approve / reject one Change Request. `afterSuccess` runs before invalidation. */
export function useReviewChangeRequest(afterSuccess?: () => unknown) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		/** `kind`: optional, only for the stale-blocked analytics event (server knows it otherwise). */
		mutationFn: ({
			changeRequestId,
			review,
		}: {
			changeRequestId: string;
			review: ReviewDecision;
			kind?: ChangeRequestKind;
		}) => reviewChangeRequest({ data: { changeRequestId, review } }),
		onSuccess: async (result, v) => {
			posthog.capture("change_request_reviewed", {
				kind: result.kind,
				decision: v.review.decision,
			});
			toast.success(v.review.decision === "approve" ? "Request approved" : "Request rejected");
			await afterSuccess?.();
			await invalidate();
		},
		onError: (error, v) => {
			if (isAppError(error) && error.kind === "Stale" && v.review.decision === "approve") {
				posthog.capture("change_request_reviewed", {
					kind: v.kind,
					decision: "approve",
					stale_blocked: true,
				});
			}
			toastMutationError("Review", "Failed to review request")(error);
		},
	});
}

/** Submitter withdraws a pending request. */
export function useWithdrawChangeRequest(afterSuccess?: () => unknown) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (changeRequestId: string) => withdrawChangeRequest({ data: { changeRequestId } }),
		onSuccess: async (result) => {
			posthog.capture("change_request_withdrawn", { kind: result.kind });
			toast.success("Request withdrawn");
			await afterSuccess?.();
			await invalidate();
		},
		onError: toastMutationError("Withdraw", "Failed to withdraw request"),
	});
}
