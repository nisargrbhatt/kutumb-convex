import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { resolveOrgStatus, type ResolvedOrgStatus } from "@/lib/org-status";
import { ORGANIZATION_STATUS } from "@/db/constants";

export const getOrgStatus = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }): Promise<ResolvedOrgStatus> => {
		const currentOrgId = context.session?.session?.activeOrganizationId;
		if (typeof currentOrgId !== "string") {
			throw new Error("No current Organization found");
		}

		return resolveOrgStatus(currentOrgId);
	});

export const getOrgStatusQuery = () =>
	queryOptions({
		queryKey: ["org-status"],
		queryFn: async ({ signal }) => getOrgStatus({ signal }),
		refetchInterval: (query) =>
			query?.state?.data?.status === ORGANIZATION_STATUS.active ? false : 5 * 1000,
	});

export const listMyOrganizationInvitations = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async () => {
		const invites = await auth.api.listUserInvitations({
			headers: getRequestHeaders(),
		});
		return invites;
	});
