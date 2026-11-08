import { authMiddleware } from "@/middleware/auth";
import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { ORG_LIMIT, MEMBER_LIMIT } from "@/domain/limits";
import {
	countUserMemberships,
	countOrgMembersAndPending,
	countOrgProfiles,
	countOrgStorageBytes,
} from "@/lib/limits-db";

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

export const getOrgUsage = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId } = context.actor;

		const [members, profiles, storageBytes] = await Promise.all([
			countOrgMembersAndPending(organizationId),
			countOrgProfiles(organizationId),
			countOrgStorageBytes(organizationId),
		]);

		return { members, profiles, storageBytes, limit: MEMBER_LIMIT };
	});
