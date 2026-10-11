import { queryOptions, useMutation } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";

import {
	addRelation,
	getMyCommunityRelationships,
	getMyIncomingRelationCount,
	getMyOutgoingRelationCount,
	removeRelation,
} from "@/server/communityRelation";
import type { RelationType } from "@/domain/relation";
import { relationKeys } from "./keys";
import { toastSubmitError, useInvalidateProfileChange, useNotifySubmit } from "./mutation";

export type RelationFormValues = {
	toId: string;
	type: RelationType;
	bloodRelation?: boolean;
	note?: string;
};

export const myRelationshipsQuery = (orgId: string) =>
	queryOptions({
		queryKey: relationKeys.mine(orgId),
		queryFn: () => getMyCommunityRelationships(),
	});

export const myIncomingRelationCountQuery = (orgId: string) =>
	queryOptions({
		queryKey: relationKeys.incomingCount(orgId),
		queryFn: () => getMyIncomingRelationCount(),
	});

export const myOutgoingRelationCountQuery = (orgId: string) =>
	queryOptions({
		queryKey: relationKeys.outgoingCount(orgId),
		queryFn: () => getMyOutgoingRelationCount(),
	});

const onRelationError = (fallback: string) => toastSubmitError("Relation", fallback);

/**
 * Outgoing relation of `profileId`: own linked profile, or a Userless one (owner/admin + own draft
 * apply directly; a plain member on an active one sends a Change Request).
 */
export function useAddRelation(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	const notify = useNotifySubmit();
	return useMutation({
		mutationFn: (values: RelationFormValues) => addRelation({ data: { ...values, profileId } }),
		onSuccess: async (result) => {
			if (!notify(result.outcome, "relation_add", "Relation added successfully")) return;
			if (result.outcome === "applied")
				posthog.capture("member_relation_added", { member_id: profileId });
			await invalidate();
		},
		onError: onRelationError("Failed to add relation"),
	});
}

export function useRemoveRelation(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	const notify = useNotifySubmit();
	return useMutation({
		mutationFn: (relationId: string) => removeRelation({ data: { profileId, relationId } }),
		onSuccess: async (result) => {
			if (!notify(result.outcome, "relation_remove", "Relation deleted successfully")) return;
			if (result.outcome === "applied")
				posthog.capture("member_relation_deleted", { member_id: profileId });
			await invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}
