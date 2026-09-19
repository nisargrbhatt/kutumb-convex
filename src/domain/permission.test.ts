import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { assertCan, can, type Actor, type Role } from "./permission";

const actorWith = (role: Role): Actor => ({ userId: "u1", organizationId: "o1", role });

// Custom app statements only (`communityProfile`, `customFields`) — better-auth's own
// default statements (organization, member, invitation, ...) are its contract, not ours.
const customStatements = {
	communityProfile: ["create", "approve", "reject", "delete", "reassign", "manageRelations"],
	customFields: ["create", "read", "delete"],
} as const;

const expected: Record<Role, Record<string, readonly string[]>> = {
	member: {
		communityProfile: ["create"],
		customFields: ["read"],
	},
	admin: {
		communityProfile: ["create", "approve", "reject", "reassign", "manageRelations"],
		customFields: ["read"],
	},
	owner: {
		communityProfile: ["create", "approve", "reject", "delete", "reassign", "manageRelations"],
		customFields: ["read", "create", "delete"],
	},
};

describe("can", () => {
	for (const role of ["owner", "admin", "member"] as const) {
		for (const [resource, actions] of Object.entries(customStatements) as [
			keyof typeof customStatements,
			readonly string[],
		][]) {
			for (const action of actions) {
				const shouldAllow = expected[role][resource]?.includes(action) ?? false;

				it(`${role} ${shouldAllow ? "can" : "cannot"} ${resource}:${action}`, () => {
					expect(can(actorWith(role), { [resource]: [action] })).toBe(shouldAllow);
				});
			}
		}
	}
});

describe("assertCan", () => {
	it("does not throw when the actor has the permission", () => {
		expect(() => assertCan(actorWith("owner"), { communityProfile: ["delete"] })).not.toThrow();
	});

	it("throws a Forbidden AppError when the actor lacks the permission", () => {
		try {
			assertCan(actorWith("member"), { communityProfile: ["delete"] });
			throw new Error("expected assertCan to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(AppError);
			expect((error as AppError).kind).toBe("Forbidden");
		}
	});
});
