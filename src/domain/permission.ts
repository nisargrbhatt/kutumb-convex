import { createAccessControl } from "better-auth/plugins/access";
import {
	defaultStatements,
	adminAc,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";
import { AppError } from "@/domain/errors";

export const statement = {
	...defaultStatements,
	communityProfile: ["create", "approve", "reject", "delete", "reassign", "manageRelations"],
	customFields: ["create", "read", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
	...memberAc.statements,
	communityProfile: ["create"],
	customFields: ["read"],
});

export const admin = ac.newRole({
	...adminAc.statements,
	communityProfile: ["create", "approve", "reject", "reassign", "manageRelations"],
	customFields: ["read"],
});

export const owner = ac.newRole({
	...ownerAc.statements,
	communityProfile: ["create", "approve", "reject", "delete", "reassign", "manageRelations"],
	customFields: ["read", "create", "delete"],
});

const roles = { owner, admin, member };

export type Role = "owner" | "admin" | "member";
export type Actor = { userId: string; organizationId: string; role: Role };
export type Permissions = Partial<{
	[K in keyof typeof statement]: (typeof statement)[K][number][];
}>;

export function can(actor: Actor, perms: Permissions): boolean {
	return roles[actor.role].authorize(perms).success;
}

export function assertCan(actor: Actor, perms: Permissions): void {
	if (!can(actor, perms)) {
		throw new AppError("Forbidden", "You do not have permission to perform this action");
	}
}
