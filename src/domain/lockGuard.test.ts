import { describe, expect, it } from "vitest";
import type { LockReason } from "./billing";
import { ORG_LOCKED_CODE, makeLockGuard } from "./lockGuard";

const guard = (locked: Record<string, LockReason>) => makeLockGuard(async (orgId) => locked[orgId]);

const locked = guard({ o1: "payment_failed" });
const open = guard({});

describe("better-auth org hooks under Lock", () => {
	it("invite: blocked on a locked org, allowed on an open one", async () => {
		await expect(locked.invite({ organization: { id: "o1" } })).rejects.toMatchObject({
			body: { code: ORG_LOCKED_CODE },
		});
		await expect(open.invite({ organization: { id: "o1" } })).resolves.toBeUndefined();
	});

	it("rename / update org: blocked under Lock", async () => {
		await expect(
			locked.updateOrganization({ member: { organizationId: "o1" } })
		).rejects.toMatchObject({ body: { code: ORG_LOCKED_CODE } });
		await expect(
			locked.updateOrganization({ member: { organizationId: "o2" } })
		).resolves.toBeUndefined();
	});

	it("role change: blocked under Lock except ownership transfer", async () => {
		const org = { id: "o1" };
		await expect(
			locked.updateMemberRole({ member: { role: "member" }, newRole: "admin", organization: org })
		).rejects.toMatchObject({ body: { code: ORG_LOCKED_CODE } });
		await expect(
			locked.updateMemberRole({ member: { role: "admin" }, newRole: "owner", organization: org })
		).resolves.toBeUndefined();
		await expect(
			locked.updateMemberRole({ member: { role: "owner" }, newRole: "admin", organization: org })
		).resolves.toBeUndefined();
		await expect(
			open.updateMemberRole({ member: { role: "member" }, newRole: "admin", organization: org })
		).resolves.toBeUndefined();
	});
});
