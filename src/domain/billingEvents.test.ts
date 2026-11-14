import { describe, expect, it } from "vitest";
import type { BillingAccess } from "./billing";
import type { DodoSubscriptionStatus } from "@/db/constants";
import { diffBillingAccess, subscriptionEventTarget } from "./billingEvents";

describe("subscriptionEventTarget: adopt-or-ignore", () => {
	const now = new Date("2026-12-10T00:00:00.000Z");
	const row = {
		subscriptionId: "sub_a" as string | null,
		status: "active" as DodoSubscriptionStatus | null,
		trialEndsAt: new Date("2026-11-01T00:00:00.000Z"),
		nextBillingDate: new Date("2027-01-01T00:00:00.000Z") as Date | null,
		cancelAtNextBillingDate: false,
		pastDueEndsAt: null as Date | null,
		hasPaymentMethod: true,
		needsSubscription: false,
	};
	const target = (r: Partial<typeof row>, incoming: Parameters<typeof subscriptionEventTarget>[1]) =>
		subscriptionEventTarget({ ...row, ...r }, incoming, now);

	it("the row's own sub → current", () => {
		expect(target({}, { subscriptionId: "sub_a" })).toBe("current");
	});

	it("a stray sub while the current one is live → ignore", () => {
		expect(target({}, { subscriptionId: "sub_b", status: "active" })).toBe("ignore");
		for (const status of ["past_due", "on_hold", "pending"] as const) {
			expect(target({ status }, { subscriptionId: "sub_b" })).toBe("ignore");
		}
		// Canceling, period not over yet: still live.
		expect(target({ cancelAtNextBillingDate: true }, { subscriptionId: "sub_b" })).toBe("ignore");
	});

	it("re-subscribe: current sub terminal → adopt the new one", () => {
		for (const status of ["cancelled", "expired", "failed"] as const) {
			expect(target({ status }, { subscriptionId: "sub_b", status: "active" })).toBe("adopt");
		}
	});

	it("re-subscribe: any locked/canceled row (paused, cancel past period end) → adopt", () => {
		expect(target({ status: "paused" }, { subscriptionId: "sub_b", status: "active" })).toBe(
			"adopt"
		);
		expect(
			target(
				{ cancelAtNextBillingDate: true, nextBillingDate: new Date("2026-12-01T00:00:00.000Z") },
				{ subscriptionId: "sub_b", status: "active" }
			)
		).toBe("adopt");
	});

	it("no sub on the row yet → adopt", () => {
		expect(target({ subscriptionId: null, status: null }, { subscriptionId: "sub_b" })).toBe(
			"adopt"
		);
	});

	it("never adopts a sub that is itself terminal (stale event for an old sub)", () => {
		expect(
			target({ status: "cancelled" }, { subscriptionId: "sub_old", status: "cancelled" })
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
