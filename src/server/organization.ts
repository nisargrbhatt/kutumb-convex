import { authMiddleware } from "@/middleware/auth";
import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { ORG_LIMIT, MEMBER_LIMIT, LIMIT_ERROR_CODES, LimitError } from "@/domain/limits";
import { AppError } from "@/domain/errors";
import { createOrganizationSchema, SLUG_TAKEN } from "@/domain/organization";
import { startOrgBilling } from "@/server/billing";
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

const betterAuthCode = (e: unknown) => (e as { body?: { code?: string } } | null)?.body?.code;

/**
 * Org create (spec: billing > Org create). better-auth applies ORG_LIMIT + org hooks and makes the
 * new org active; then its `orgBilling` row + Dodo Trial (best-effort: Dodo down still creates).
 */
export const createOrganizationFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(createOrganizationSchema)
	.handler(async ({ context, data }) => {
		const org = await auth.api
			.createOrganization({
				body: {
					name: data.name,
					slug: data.slug,
					keepCurrentActiveOrganization: false,
					metadata: {},
				},
				headers: getRequestHeaders(),
			})
			.catch((error: unknown) => {
				const code = betterAuthCode(error);
				if (code === LIMIT_ERROR_CODES.org) throw new LimitError("org");
				if (code === "ORGANIZATION_ALREADY_EXISTS" || code === "ORGANIZATION_SLUG_ALREADY_TAKEN") {
					throw new AppError("Conflict", "Organization slug already exist", SLUG_TAKEN);
				}
				throw error;
			});
		if (!org) throw new Error("Organization was not created");

		const { subscribed } = await startOrgBilling({
			organizationId: org.id,
			createdByUserId: context.userId,
			country: data.country,
			createdAt: new Date(org.createdAt),
		});
		return { organizationId: org.id, subscribed };
	});
