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
} as const;

export const ac = createAccessControl(statement);

export const member = ac.newRole({
	...memberAc.statements,
	communityProfile: ["create"],
});

export const admin = ac.newRole({
	...adminAc.statements,
	communityProfile: ["create", "approve", "reject"],
});

export const owner = ac.newRole({
	...ownerAc.statements,
	communityProfile: ["create", "approve", "reject", "delete"],
});
