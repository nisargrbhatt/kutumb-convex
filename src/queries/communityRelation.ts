import { queryOptions, useMutation } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import {
	addRelation,
	getMyCommunityRelationships,
	getMyIncomingRelationCount,
	getMyOutgoingRelationCount,
	removeRelation,
} from "@/server/communityRelation";
import type { RelationType } from "@/domain/relation";
import { relationKeys } from "./keys";
import { toastMutationError, useInvalidateProfileChange } from "./mutation";

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

const onRelationError = (fallback: string) => toastMutationError("Relation", fallback);

/** Outgoing relation of `profileId`: own linked profile, or a Userless one for owner/admin. */
export function useAddRelation(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (values: RelationFormValues) => addRelation({ data: { ...values, profileId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_added", { member_id: profileId });
			toast.success("Relation", { description: "Relation added successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to add relation"),
	});
}

export function useRemoveRelation(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (relationId: string) => removeRelation({ data: { profileId, relationId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_deleted", { member_id: profileId });
			toast.success("Relation", { description: "Relation deleted successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}
