import { getFullUserContextCached } from "@/api/auth";
import { db } from "@/db";
import type { ORGANIZATION_ROLES } from "@/db/constants";
import { authMiddleware } from "@/middleware/auth";
import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";

export const checkOrgPaymentDone = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const orgId = context.session?.session?.activeOrganizationId;
		if (typeof orgId !== "string") {
			throw new Error("No active org selected");
		}

		const orgInfo = await db.query.organization.findFirst({
			where: (fields, op) => op.eq(fields.id, orgId),
			columns: {
				metadata: true,
			},
		});

		if (!orgInfo) {
			throw new Error("Invalid Org");
		}

		try {
			const parsedMetadata = JSON.parse(orgInfo?.metadata ?? "{}");
			return {
				paymentPending: !parsedMetadata?.paymentSetup,
			};
		} catch (error) {
			return {
				paymentPending: true,
			};
		}
	});

export const checkOrgRoleResult = createServerOnlyFn(
	async (props: {
		userId: string;
		organizationId?: string;
		organizationSlug?: string;
		requiredRoles: Array<keyof typeof ORGANIZATION_ROLES>;
	}) => {
		if (!props?.organizationId && !props?.organizationSlug) {
			throw new Error("Organization id or slug is required");
		}

		const cachedUserContext = await getFullUserContextCached(props.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const organization = props?.organizationId
			? cachedUserContext.organization?.find((org) => org.id === props?.organizationId)
			: cachedUserContext.organization?.find((org) => org.slug === props?.organizationSlug);

		if (!organization) {
			throw new Error("Organization not found");
		}

		const userRole = organization.membership.role;

		if (props.requiredRoles.includes(userRole)) {
			return organization;
		}

		return null;
	}
);
