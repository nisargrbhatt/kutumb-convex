import type { CommunityProfileInput, MemberFilter } from "@/domain/communityProfile";
import { LIMIT_COPY } from "@/domain/limits";
import { addMemberFeedback } from "@/domain/memberRequests";
import { queryOptions, useMutation } from "@tanstack/react-query";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import {
	createProfile,
	deactivateProfile,
	deleteProfile,
	getActiveMemberCount,
	getActiveProfilesForRelation,
	getCommunityMemberById,
	getCommunityMembers,
	getFocusedCommunityGraph,
	getMyCommunityProfile,
	getPendingRequestCount,
	reactivateProfile,
	reassignProfile,
	searchCommunityProfilesLite,
	updateProfileInfo,
} from "@/server/communityProfile";
import { changeRequestKeys, profileKeys } from "./keys";
import { toastMutationError, useInvalidateProfileChange, useSubmitMutation } from "./mutation";

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

/** Owner/admin: pending Change Requests on one profile (lifecycle confirm copy). */
export const pendingRequestCountQuery = (orgId: string, profileId: string) =>
	queryOptions({
		queryKey: changeRequestKeys.forProfile(orgId, profileId),
		queryFn: () => getPendingRequestCount({ data: { profileId } }),
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

/** Own linked profile: create when missing, else info edit against the loaded `version`. */
export function useSaveMyProfile() {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: ({
			current,
			input,
		}: {
			current: { id: string; version: number } | null;
			input: CommunityProfileInput;
		}) =>
			current
				? updateProfileInfo({
						data: { profileId: current.id, expectedVersion: current.version, profile: input },
					})
				: createProfile({ data: { self: true, profile: input } }),
		onSuccess: async (result) => {
			if (result.outcome === "unchanged") {
				toast.info("No changes to save");
				return;
			}
			toast.success("Profile saved");
			posthog.capture("profile_saved", { outcome: result.outcome });
			await invalidate();
		},
		onError: toastMutationError("Profile", "Failed to save profile", LIMIT_COPY.profileSelf),
	});
}

/** Info edit of a Userless Profile: owner/admin + own draft apply, plain member on active requests. */
export function useUpdateProfileInfo(profileId: string) {
	const posthog = usePostHog();
	return useSubmitMutation({
		mutationFn: (v: { expectedVersion: number; input: CommunityProfileInput }) =>
			updateProfileInfo({
				data: { profileId, expectedVersion: v.expectedVersion, profile: v.input },
			}),
		kind: "info",
		appliedTitle: "Profile saved",
		error: { title: "Profile", fallback: "Failed to save profile" },
		onWritten: (result) => posthog.capture("profile_saved", { outcome: result.outcome }),
	});
}

export function useAddMissingMember() {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (input: CommunityProfileInput) =>
			createProfile({ data: { self: false, profile: input } }),
		onSuccess: async (result) => {
			posthog.capture("member_added", { outcome: result.outcome });
			if (result.outcome === "requested") {
				posthog.capture("change_request_submitted", { kind: "create" });
			}
			// A create is never `unchanged`; anything not applied is a pending Draft Record.
			const f = addMemberFeedback(result.outcome === "applied" ? "applied" : "requested");
			toast.success(f.title, { description: f.description });
			await invalidate();
		},
		onError: toastMutationError("Add member", "Failed to add member"),
	});
}

export function useReassignProfile(profileId: string) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: (userId: string) => reassignProfile({ data: { userId, profileId } }),
		onSuccess: async (_data, userId) => {
			posthog.capture("member_profile_reassigned", {
				member_id: profileId,
				assigned_user_id: userId,
			});
			toast.success("Profile", { description: "Profile reassigned successfully" });
			await invalidate();
		},
		onError: toastMutationError("Profile", "Failed to reassign profile"),
	});
}

function useLifecycle(
	profileId: string,
	fn: (a: { data: { profileId: string } }) => Promise<unknown>,
	copy: { event: string; success: string; failure: string },
	/** Runs before invalidation (e.g. leave a detail page whose profile is gone). */
	beforeInvalidate?: () => unknown
) {
	const invalidate = useInvalidateProfileChange();
	const posthog = usePostHog();
	return useMutation({
		mutationFn: () => fn({ data: { profileId } }),
		onSuccess: async () => {
			posthog.capture(copy.event);
			toast.success("Profile", { description: copy.success });
			await beforeInvalidate?.();
			await invalidate();
		},
		onError: toastMutationError("Profile", copy.failure),
	});
}

export const useDeactivateProfile = (profileId: string) =>
	useLifecycle(profileId, deactivateProfile, {
		event: "profile_deactivated",
		success: "Profile deactivated",
		failure: "Failed to deactivate profile",
	});

export const useReactivateProfile = (profileId: string) =>
	useLifecycle(profileId, reactivateProfile, {
		event: "profile_reactivated",
		success: "Profile reactivated",
		failure: "Failed to reactivate profile",
	});

export const useDeleteProfile = (profileId: string, onDeleted: () => unknown) =>
	useLifecycle(
		profileId,
		deleteProfile,
		{
			event: "profile_deleted",
			success: "Profile deleted",
			failure: "Failed to delete profile",
		},
		onDeleted
	);
