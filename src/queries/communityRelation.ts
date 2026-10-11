import { queryOptions } from "@tanstack/react-query";
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
import { useSubmitMutation } from "./mutation";

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

/**
 * Outgoing relation of `profileId`: own linked profile, or a Userless one (owner/admin + own draft
 * apply directly; a plain member on an active one sends a Change Request).
 */
export function useAddRelation(profileId: string) {
	const posthog = usePostHog();
	return useSubmitMutation({
		mutationFn: (values: RelationFormValues) => addRelation({ data: { ...values, profileId } }),
		kind: "relation_add",
		appliedTitle: "Relation added successfully",
		error: { title: "Relation", fallback: "Failed to add relation" },
		onWritten: (result) => {
			if (result.outcome === "applied")
				posthog.capture("member_relation_added", { member_id: profileId });
		},
	});
}

export function useRemoveRelation(profileId: string) {
	const posthog = usePostHog();
	return useSubmitMutation({
		mutationFn: (relationId: string) => removeRelation({ data: { profileId, relationId } }),
		kind: "relation_remove",
		appliedTitle: "Relation deleted successfully",
		error: { title: "Relation", fallback: "Failed to delete relation" },
		onWritten: (result) => {
			if (result.outcome === "applied")
				posthog.capture("member_relation_deleted", { member_id: profileId });
		},
	});
}
