import type { CommunityProfileInput, MemberFilter } from "@/domain/communityProfile";
import { LIMIT_COPY } from "@/domain/limits";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import {
	acceptCommunityProfile,
	addMissingMember,
	getActiveMemberCount,
	getActiveProfilesForRelation,
	getCommunityMemberById,
	getCommunityMembers,
	getFocusedCommunityGraph,
	getMyCommunityProfile,
	reassignProfileToUser,
	rejectCommunityProfile,
	searchCommunityProfilesLite,
	upsertMyCommunityProfile,
} from "@/server/communityProfile";
import { orgKeys, profileKeys, relationKeys } from "./keys";
import { toastMutationError, useOrgId } from "./mutation";

export const myProfileQuery = (orgId: string) =>
	queryOptions({
		queryKey: profileKeys.mine(orgId),
		queryFn: () => getMyCommunityProfile(),
	});

export const activeMemberCountQuery = (orgId: string) =>
	queryOptions({
		queryKey: profileKeys.activeCount(orgId),
		queryFn: () => getActiveMemberCount(),
	});

export const activeProfilesForRelationQuery = (orgId: string, subjectId: string) =>
	queryOptions({
		queryKey: profileKeys.forRelation(orgId, subjectId),
		queryFn: () => getActiveProfilesForRelation({ data: { subjectId } }),
	});

export const communityMembersQuery = (orgId: string, filter: MemberFilter) =>
	queryOptions({
		queryKey: profileKeys.list(orgId, filter),
		queryFn: () => getCommunityMembers({ data: filter }),
	});

export const memberDetailQuery = (orgId: string, id: string) =>
	queryOptions({
		queryKey: profileKeys.detail(orgId, id),
		queryFn: () => getCommunityMemberById({ data: { id } }),
	});

export const focusedCommunityGraphQuery = (
	orgId: string,
	props?: { focusId?: string; depth?: number }
) =>
	queryOptions({
		queryKey: profileKeys.graph(orgId, props?.focusId ?? "__default__", props?.depth ?? 2),
		queryFn: () =>
			getFocusedCommunityGraph({
				data: { focusId: props?.focusId, depth: props?.depth ?? 2 },
			}),
		staleTime: 5 * 60 * 1000,
	});

export const searchCommunityProfilesLiteQuery = (orgId: string, query: string) =>
	queryOptions({
		queryKey: profileKeys.search(orgId, query),
		queryFn: () => searchCommunityProfilesLite({ data: { query } }),
		staleTime: 60 * 1000,
		enabled: query.trim().length > 0,
	});

export function useUpsertMyProfile() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (input: CommunityProfileInput) => upsertMyCommunityProfile({ data: input }),
		onSuccess: async () => {
			toast.success("Profile saved");
			posthog.capture("profile_saved");
			await Promise.all([
				qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
				// My relationships carry my profileId.
				qc.invalidateQueries({ queryKey: relationKeys.all(orgId) }),
				qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) }),
			]);
		},
		onError: toastMutationError("Profile", "Failed to save profile", LIMIT_COPY.profileSelf),
	});
}

export function useAddMissingMember() {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (input: CommunityProfileInput) => addMissingMember({ data: input }),
		onSuccess: async () => {
			posthog.capture("member_added", {});
			toast.success("Member added", {
				description: "Added as a Draft Record. An owner/admin will approve the profile.",
			});
			await Promise.all([
				qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
				qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) }),
			]);
		},
		onError: toastMutationError("Add member", "Failed to add member"),
	});
}

export function useApproveProfile(profileId: string) {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: () => acceptCommunityProfile({ data: { memberId: profileId } }),
		onSuccess: async () => {
			posthog.capture("member_profile_accepted", { member_id: profileId });
			toast.success("Profile", { description: "Profile accepted successfully" });
			await qc.invalidateQueries({ queryKey: profileKeys.all(orgId) });
		},
		onError: toastMutationError("Profile", "Failed to accept profile"),
	});
}

export function useRejectProfile(profileId: string) {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: () => rejectCommunityProfile({ data: { memberId: profileId } }),
		onSuccess: async () => {
			posthog.capture("member_profile_rejected", { member_id: profileId });
			toast.success("Profile", { description: "Profile rejected successfully" });
			await Promise.all([
				qc.invalidateQueries({ queryKey: profileKeys.all(orgId) }),
				qc.invalidateQueries({ queryKey: orgKeys.usage(orgId) }),
			]);
		},
		onError: toastMutationError("Profile", "Failed to reject profile"),
	});
}

export function useReassignProfile(profileId: string) {
	const qc = useQueryClient();
	const orgId = useOrgId();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (userId: string) =>
			reassignProfileToUser({ data: { userId, memberId: profileId } }),
		onSuccess: async (_data, userId) => {
			posthog.capture("member_profile_reassigned", {
				member_id: profileId,
				assigned_user_id: userId,
			});
			toast.success("Profile", { description: "Profile reassigned successfully" });
			await qc.invalidateQueries({ queryKey: profileKeys.all(orgId) });
		},
		onError: toastMutationError("Profile", "Failed to reassign profile"),
	});
}
