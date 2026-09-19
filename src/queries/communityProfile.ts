import { queryOptions } from "@tanstack/react-query";
import {
	getActiveMemberCount,
	getActiveProfilesForRelation,
	getCommunityMembers,
	getCommunityProfileList,
	getFocusedCommunityGraph,
	getMyCommunityProfile,
	searchCommunityProfilesLite,
} from "@/server/communityProfile";

export const getMyCommunityProfileQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-profile"],
		queryFn: async () => {
			const result = await getMyCommunityProfile();
			return result;
		},
		staleTime: 0,
		gcTime: 0,
	});

export const getActiveMemberCountQuery = () =>
	queryOptions({
		queryKey: ["get-active-member-count"],
		queryFn: async () => {
			const result = await getActiveMemberCount();
			return result;
		},
	});

export const getCommunityProfileListQuery = () =>
	queryOptions({
		queryKey: ["get-community-profile-list"],
		queryFn: async () => {
			const result = await getCommunityProfileList();
			return result;
		},
	});

export const getActiveProfilesForRelationQuery = (subjectId: string) =>
	queryOptions({
		queryKey: ["get-active-profiles-for-relation", subjectId],
		queryFn: async () => {
			const result = await getActiveProfilesForRelation({ data: { subjectId } });
			return result;
		},
	});

export const getCommunityMembersQuery = (props: {
	search?: string;
	status?: string;
	gender?: string;
	page?: number;
	pageSize?: number;
}) =>
	queryOptions({
		queryKey: [
			"get-community-members",

			props.search ?? "",
			props.status ?? "",
			props.gender ?? "",
			props.page ?? 1,
			props.pageSize ?? 10,
		],
		queryFn: async () => {
			const result = await getCommunityMembers({
				data: {
					search: props.search,
					status: props.status as "active" | "inactive" | "draft" | undefined,
					gender: props.gender as "male" | "female" | "other" | undefined,
					page: props.page ?? 1,
					pageSize: props.pageSize ?? 10,
				},
			});
			return result;
		},
	});

export const getFocusedCommunityGraphQuery = (props?: { focusId?: string; depth?: number }) =>
	queryOptions({
		queryKey: ["community-graph", props?.focusId ?? "__default__", props?.depth ?? 2],
		queryFn: async () =>
			getFocusedCommunityGraph({
				data: { focusId: props?.focusId, depth: props?.depth ?? 2 },
			}),
		staleTime: 5 * 60 * 1000,
	});

export const searchCommunityProfilesLiteQuery = (query: string) =>
	queryOptions({
		queryKey: ["community-profile-search", query],
		queryFn: async () => searchCommunityProfilesLite({ data: { query } }),
		staleTime: 60 * 1000,
		enabled: query.trim().length > 0,
	});
