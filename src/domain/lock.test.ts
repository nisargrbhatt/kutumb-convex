import { describe, expect, it } from "vitest";
import type { OrgBillingRow } from "./billing";
import { lockAllowsRoleChange, orgLockReason, orgLockedToolText } from "./lock";

const T0 = new Date("2026-11-14T00:00:00.000Z");
const trialRow = (trialEndsAt: Date): OrgBillingRow => ({
	status: null,
	trialEndsAt,
	nextBillingDate: null,
	cancelAtNextBillingDate: false,
	pastDueEndsAt: null,
	hasPaymentMethod: false,
	needsSubscription: true,
});

describe("orgLockReason", () => {
	it("open org → undefined", () => {
		expect(orgLockReason(trialRow(new Date(T0.getTime() + 1)), T0)).toBeUndefined();
	});

	it("locked org → its reason", () => {
		expect(orgLockReason(trialRow(T0), T0)).toBe("trial_ended");
	});

	it("no billing row → default-deny (trial_ended)", () => {
		expect(orgLockReason(null, T0)).toBe("trial_ended");
		expect(orgLockReason(undefined, T0)).toBe("trial_ended");
	});
});

describe("lockAllowsRoleChange (ownership transfer only)", () => {
	it("promote to owner → allowed", () => {
		expect(lockAllowsRoleChange({ currentRole: "admin", newRole: "owner" })).toBe(true);
	});

	it("demote an owner → allowed", () => {
		expect(lockAllowsRoleChange({ currentRole: "owner", newRole: "admin" })).toBe(true);
	});

	it("member ↔ admin → blocked", () => {
		expect(lockAllowsRoleChange({ currentRole: "member", newRole: "admin" })).toBe(false);
		expect(lockAllowsRoleChange({ currentRole: "admin", newRole: "member" })).toBe(false);
	});

	it("multi-role strings count", () => {
		expect(lockAllowsRoleChange({ currentRole: "member", newRole: "admin,owner" })).toBe(true);
	});
});

describe("orgLockedToolText", () => {
	it("spec wording", () => {
		expect(
			orgLockedToolText({ orgName: "Patel", reason: "payment_failed", appOrigin: "https://k.test" })
		).toBe(
			`OrgLocked (payment_failed): "Patel" is locked: its last payment failed. Its data is safe. Tell the user an owner must subscribe at https://k.test/locked; retrying won't help.`
		);
	});
});
