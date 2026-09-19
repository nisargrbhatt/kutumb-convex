import { queryOptions } from "@tanstack/react-query";
import { getMyOrganizationCount, getOrgUsage } from "@/server/organization";

export const getMyOrganizationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-organization-count"],
		queryFn: async () => await getMyOrganizationCount(),
	});

export const getOrgUsageQuery = () =>
	queryOptions({
		queryKey: ["get-org-usage"],
		queryFn: async () => await getOrgUsage(),
	});
