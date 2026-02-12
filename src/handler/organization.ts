import { getFullUserContextCached } from "@/api/auth";
import type { ORGANIZATION_ROLES } from "@/db/constants";
import type { PrimaryKey } from "@/db/schema";
import { createServerOnlyFn } from "@tanstack/react-start";

export const checkOrgRoleResult = createServerOnlyFn(
	async (props: {
		userId: string;
		organizationId?: string | PrimaryKey<"organization">;
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
