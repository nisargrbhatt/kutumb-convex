import { queryOptions } from "@tanstack/react-query";
import { getMyCommunityAddresses } from "@/server/communityAddress";

export const getMyCommunityAddressesQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-addresses"],
		queryFn: async () => {
			const result = await getMyCommunityAddresses();
			return result;
		},
	});
