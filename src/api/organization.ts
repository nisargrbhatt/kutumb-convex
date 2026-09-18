import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { queryOptions } from "@tanstack/react-query";
import { auth } from "@/lib/auth";
import { ORG_LIMIT, MEMBER_LIMIT } from "@/lib/limits";
import { countUserMemberships, countOrgMembersAndPending, countOrgProfiles } from "@/lib/limits-db";

export const listMyOrganizationInvitations = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const invites = await auth.api.listUserInvitations({
			headers: getRequestHeaders(),
		});
		return invites;
	});

export const getMyOrganizationCount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const count = await countUserMemberships(context.userId);
		return { count, limit: ORG_LIMIT };
	});

export const getMyOrganizationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-organization-count"],
		queryFn: async () => await getMyOrganizationCount(),
	});

export const getOrgUsage = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const [members, profiles] = await Promise.all([
			countOrgMembersAndPending(organizationId),
			countOrgProfiles(organizationId),
		]);

		return { members, profiles, limit: MEMBER_LIMIT };
	});

export const getOrgUsageQuery = () =>
	queryOptions({
		queryKey: ["get-org-usage"],
		queryFn: async () => await getOrgUsage(),
	});
