import { queryOptions } from "@tanstack/react-query";
import {
	getMyCommunityRelationships,
	getMyIncomingRelationCount,
	getMyOutgoingRelationCount,
} from "@/server/communityRelation";

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
