import { getFullUserContextCached } from "@/api/auth";
import type { ORGANIZATION_ROLES } from "@/db/constants";
import type { PrimaryKey } from "@/db/schema";
import { createServerOnlyFn } from "@tanstack/react-start";

export const checkOrgRoleResult = createServerOnlyFn(
	async (props: {
		userId: string;
		organizationId: string | PrimaryKey<"organization">;
		requiredRoles: Array<keyof typeof ORGANIZATION_ROLES>;
	}) => {
		const cachedUserContext = await getFullUserContextCached(props.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const organization = cachedUserContext.organization?.find(
			(org) => org.id === props.organizationId
		);

		if (!organization) {
			throw new Error("Organization not found");
		}

		const userRole = organization.membership.role;

		return props.requiredRoles.includes(userRole);
	}
);
