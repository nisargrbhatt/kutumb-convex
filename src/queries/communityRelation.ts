import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
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

export type RelationFormValues = {
	toId: string;
	type: RelationType;
	bloodRelation?: boolean;
	note?: string;
};

export const getMyCommunityRelationshipsQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-relationships"],
		queryFn: async () => {
			const result = await getMyCommunityRelationships();
			return result;
		},
	});

export const getMyIncomingRelationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-incoming-relation-count"],
		queryFn: async () => {
			const result = await getMyIncomingRelationCount();
			return result;
		},
	});

export const getMyOutgoingRelationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-outgoing-relation-count"],
		queryFn: async () => {
			const result = await getMyOutgoingRelationCount();
			return result;
		},
	});

const onRelationError = (fallback: string) => (error: Error) => {
	console.error(error);
	toast.error("Relation", { description: error.message || fallback });
};

function useInvalidateMyRelations() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all(
			[
				getMyCommunityRelationshipsQuery(),
				getMyIncomingRelationCountQuery(),
				getMyOutgoingRelationCountQuery(),
			].map((q) => queryClient.invalidateQueries({ queryKey: q.queryKey }))
		);
}

export function useAddMyRelation() {
	const invalidate = useInvalidateMyRelations();
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
	const invalidate = useInvalidateMyRelations();
	return useMutation({
		mutationFn: (relationId: string) => deleteMyCommunityRelationship({ data: { id: relationId } }),
		onSuccess: async () => {
			toast.success("Relation", { description: "Relation deleted successfully" });
			await invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}

/** Admin: outgoing relation on behalf of a userless profile; refreshes the member route loader. */
export function useAddRelationToProfile(subjectId: string) {
	const router = useRouter();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (values: RelationFormValues) =>
			addCommunityRelationToProfile({ data: { ...values, subjectId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_added", { member_id: subjectId });
			toast.success("Relation", { description: "Relation added successfully" });
			await router.invalidate();
		},
		onError: onRelationError("Failed to add relation"),
	});
}

export function useDeleteRelationFromProfile(subjectId: string) {
	const router = useRouter();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (relationId: string) =>
			deleteCommunityRelationFromProfile({ data: { subjectId, relationId } }),
		onSuccess: async () => {
			posthog.capture("member_relation_deleted", { member_id: subjectId });
			toast.success("Relation", { description: "Relation deleted successfully" });
			await router.invalidate();
		},
		onError: onRelationError("Failed to delete relation"),
	});
}
