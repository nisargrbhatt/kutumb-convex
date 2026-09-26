import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import {
	addCommunityRelationToProfile,
	addMyCommunityRelationship,
	deleteCommunityRelationFromProfile,
	deleteMyCommunityRelationship,
	getMyCommunityRelationships,
	getMyIncomingRelationCount,
	getMyOutgoingRelationCount,
} from "@/server/communityRelation";
import type { RelationType } from "@/domain/relation";
import { profileKeys, relationKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

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

/** Relations feed my lists/counts, member details (both directions) and the graph. */
function useInvalidateRelations() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	return () =>
		Promise.all([
			qc.invalidateQueries({ queryKey: relationKeys.all(orgId) }),
			qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
		]);
}

const onRelationError = (fallback: string) => toastMutationError("Relation", fallback);

export function useAddMyRelation() {
	const invalidate = useInvalidateRelations();
	return useMutation({
		mutationFn: (values: RelationFormValues) => addMyCommunityRelationship({ data: values }),
		onSuccess: async () => {
			toast.success("Relation", { description: "Relation added successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to add relation"),
	});
}

export function useDeleteMyRelation() {
	const invalidate = useInvalidateRelations();
	return useMutation({
		mutationFn: (relationId: string) => deleteMyCommunityRelationship({ data: { id: relationId } }),
		onSuccess: async () => {
			toast.success("Relation", { description: "Relation deleted successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}

/** Admin: outgoing relation on behalf of a userless profile. */
export function useAddRelationToProfile(subjectId: string) {
	const invalidate = useInvalidateRelations();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (values: RelationFormValues) =>
			addCommunityRelationToProfile({ data: { ...values, subjectId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_added", { member_id: subjectId });
			toast.success("Relation", { description: "Relation added successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to add relation"),
	});
}

export function useDeleteRelationFromProfile(subjectId: string) {
	const invalidate = useInvalidateRelations();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (relationId: string) =>
			deleteCommunityRelationFromProfile({ data: { subjectId, relationId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_deleted", { member_id: subjectId });
			toast.success("Relation", { description: "Relation deleted successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}
