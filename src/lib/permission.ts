import { createAccessControl } from "better-auth/plugins/access";
import {
	defaultStatements,
	adminAc,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
	...defaultStatements,
	communityProfile: ["create", "approve", "reject", "delete"],
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
	communityProfile: ["create", "approve", "reject"],
	customFields: ["read"],
});

export const owner = ac.newRole({
	...ownerAc.statements,
	communityProfile: ["create", "approve", "reject", "delete"],
	customFields: ["read", "create", "delete"],
});
