import { describe, expect, it } from "vitest";
import type { BillingAccess } from "./billing";
import { diffBillingAccess, subscriptionEventTarget } from "./billingEvents";

describe("subscriptionEventTarget: adopt-or-ignore", () => {
	const row = { subscriptionId: "sub_a", status: "active" as const };

	it("the row's own sub → current", () => {
		expect(subscriptionEventTarget(row, { subscriptionId: "sub_a" })).toBe("current");
	});

	it("a stray sub while the current one is live → ignore", () => {
		expect(subscriptionEventTarget(row, { subscriptionId: "sub_b", status: "active" })).toBe(
			"ignore"
		);
		for (const status of ["past_due", "on_hold", "pending", "paused"] as const) {
			expect(subscriptionEventTarget({ ...row, status }, { subscriptionId: "sub_b" })).toBe(
				"ignore"
			);
		}
	});

	it("re-subscribe: current sub terminal → adopt the new one", () => {
		for (const status of ["cancelled", "expired", "failed"] as const) {
			expect(
				subscriptionEventTarget({ ...row, status }, { subscriptionId: "sub_b", status: "active" })
			).toBe("adopt");
		}
	});

	it("no sub on the row yet → adopt", () => {
		expect(
			subscriptionEventTarget({ subscriptionId: null, status: null }, { subscriptionId: "sub_b" })
		).toBe("adopt");
	});

	it("never adopts a sub that is itself terminal (stale event for an old sub)", () => {
		expect(
			subscriptionEventTarget(
				{ ...row, status: "cancelled" },
				{ subscriptionId: "sub_old", status: "cancelled" }
			)
		).toBe("ignore");
	});
});

describe("diffBillingAccess", () => {
	const trialEndsAt = new Date("2026-11-29T00:00:00.000Z");
	const a = (over: Partial<BillingAccess>): BillingAccess => ({
		state: "trialing",
		locked: false,
		hasPaymentMethod: false,
		trialEndsAt,
		...over,
	});
	const lockedPaymentFailed = a({
		state: "locked",
		locked: true,
		lockReason: "payment_failed",
		hasPaymentMethod: true,
	});

	it("no change → no events", () => {
		expect(diffBillingAccess(a({}), a({}))).toEqual([]);
	});

	it("card added → subscribed", () => {
		expect(diffBillingAccess(a({}), a({ hasPaymentMethod: true }))).toEqual(["subscribed"]);
	});

	it("→ grace → payment_failed + grace_started", () => {
		expect(
			diffBillingAccess(
				a({ state: "active", hasPaymentMethod: true }),
				a({ state: "grace", hasPaymentMethod: true })
			)
		).toEqual(["payment_failed", "grace_started"]);
	});

	it("→ locked/payment_failed straight from active → payment_failed", () => {
		expect(
			diffBillingAccess(a({ state: "active", hasPaymentMethod: true }), lockedPaymentFailed)
		).toEqual(["payment_failed"]);
	});

	it("grace → locked/payment_failed: same failure, no second event", () => {
		expect(
			diffBillingAccess(a({ state: "grace", hasPaymentMethod: true }), lockedPaymentFailed)
		).toEqual([]);
	});

	it("→ canceling → canceled", () => {
		expect(diffBillingAccess(a({ state: "active" }), a({ state: "canceling" }))).toEqual([
			"canceled",
		]);
		expect(diffBillingAccess(a({ state: "canceling" }), a({ state: "canceling" }))).toEqual([]);
	});
});
