import { queryOptions, useMutation } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import type { ReviewDecision } from "@/domain/profileChanges";
import { isAppError } from "@/domain/errors";
import {
	getPendingCreateRequest,
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

/** Approve / reject one Change Request. `afterSuccess` runs before invalidation. */
export function useReviewChangeRequest(afterSuccess?: () => unknown) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (v: { changeRequestId: string; review: ReviewDecision }) =>
			reviewChangeRequest({ data: v }),
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
