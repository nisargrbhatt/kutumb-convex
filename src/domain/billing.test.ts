import { describe, expect, it } from "vitest";
import { billingAccess, type OrgBillingRow } from "./billing";

const DAY = 86_400_000;
const T0 = new Date("2026-11-14T00:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const trialEndsAt = at(15 * DAY);

const row = (over: Partial<OrgBillingRow> = {}): OrgBillingRow => ({
	status: "active",
	trialEndsAt,
	nextBillingDate: trialEndsAt,
	cancelAtNextBillingDate: false,
	pastDueEndsAt: null,
	hasPaymentMethod: false,
	needsSubscription: false,
	...over,
});

describe("billingAccess: no sub yet", () => {
	const noSub = row({ needsSubscription: true, status: null, nextBillingDate: null });

	it("trials until trialEndsAt", () => {
		expect(billingAccess(noSub, at(15 * DAY - 1))).toEqual({
			state: "trialing",
			locked: false,
			hasPaymentMethod: false,
			trialEndsAt,
			trialDaysLeft: 1,
		});
	});

	it("locks trial_ended at trialEndsAt", () => {
		expect(billingAccess(noSub, trialEndsAt)).toEqual({
			state: "locked",
			locked: true,
			lockReason: "trial_ended",
			hasPaymentMethod: false,
			trialEndsAt,
		});
	});
});

describe("billingAccess: pending", () => {
	it("is pending, not locked, even past the trial", () => {
		expect(billingAccess(row({ status: "pending" }), at(30 * DAY))).toEqual({
			state: "pending",
			locked: false,
			hasPaymentMethod: false,
			trialEndsAt,
		});
	});
});

describe("billingAccess: terminal statuses", () => {
	for (const status of ["cancelled", "expired", "failed", "paused"] as const) {
		it(`${status} locks canceled, even mid-trial`, () => {
			const a = billingAccess(row({ status, hasPaymentMethod: true }), at(DAY));
			expect(a).toEqual({
				state: "locked",
				locked: true,
				lockReason: "canceled",
				hasPaymentMethod: true,
				trialEndsAt,
			});
		});
	}
});

describe("billingAccess: on_hold", () => {
	it("no card → locked trial_ended", () => {
		const a = billingAccess(row({ status: "on_hold" }), at(16 * DAY));
		expect(a).toMatchObject({ state: "locked", locked: true, lockReason: "trial_ended" });
	});

	it("card → locked payment_failed", () => {
		const a = billingAccess(row({ status: "on_hold", hasPaymentMethod: true }), at(40 * DAY));
		expect(a).toMatchObject({ state: "locked", locked: true, lockReason: "payment_failed" });
	});
});

describe("billingAccess: past_due", () => {
	const pastDueEndsAt = at(40 * DAY);
	const pastDue = row({ status: "past_due", hasPaymentMethod: true, pastDueEndsAt });

	it("grace until pastDueEndsAt", () => {
		expect(billingAccess(pastDue, at(40 * DAY - 1))).toEqual({
			state: "grace",
			locked: false,
			hasPaymentMethod: true,
			trialEndsAt,
			graceEndsAt: pastDueEndsAt,
		});
	});

	it("locks payment_failed at pastDueEndsAt", () => {
		expect(billingAccess(pastDue, pastDueEndsAt)).toMatchObject({
			state: "locked",
			locked: true,
			lockReason: "payment_failed",
		});
	});

	it("missing pastDueEndsAt → grace with no end", () => {
		const a = billingAccess(row({ status: "past_due", hasPaymentMethod: true }), at(90 * DAY));
		expect(a).toEqual({ state: "grace", locked: false, hasPaymentMethod: true, trialEndsAt });
	});
});

describe("billingAccess: active, cancel at next billing date", () => {
	it("cancel during Trial → canceling until nextBillingDate (wins over Trial)", () => {
		const r = row({ cancelAtNextBillingDate: true, hasPaymentMethod: true });
		expect(billingAccess(r, at(15 * DAY - 1))).toEqual({
			state: "canceling",
			locked: false,
			hasPaymentMethod: true,
			trialEndsAt,
			accessEndsAt: trialEndsAt,
		});
		expect(billingAccess(r, trialEndsAt)).toMatchObject({
			state: "locked",
			locked: true,
			lockReason: "canceled",
		});
	});

	it("cancel after Trial → canceling until nextBillingDate, then locked canceled", () => {
		const nextBillingDate = at(45 * DAY);
		const r = row({ cancelAtNextBillingDate: true, hasPaymentMethod: true, nextBillingDate });
		expect(billingAccess(r, at(45 * DAY - 1))).toMatchObject({
			state: "canceling",
			locked: false,
			accessEndsAt: nextBillingDate,
		});
		expect(billingAccess(r, nextBillingDate)).toMatchObject({
			state: "locked",
			lockReason: "canceled",
		});
	});

	it("missing nextBillingDate → canceling with no end (never a false Lock)", () => {
		const r = row({ cancelAtNextBillingDate: true, nextBillingDate: null });
		expect(billingAccess(r, at(90 * DAY))).toEqual({
			state: "canceling",
			locked: false,
			hasPaymentMethod: false,
			trialEndsAt,
		});
	});
});

describe("billingAccess: active", () => {
	it("trialing without card before trialEndsAt; days left rounds up", () => {
		expect(billingAccess(row(), T0)).toEqual({
			state: "trialing",
			locked: false,
			hasPaymentMethod: false,
			trialEndsAt,
			trialDaysLeft: 15,
		});
		expect(billingAccess(row(), at(DAY + 1))).toMatchObject({ trialDaysLeft: 14 });
	});

	it("trialing with card → first charge at nextBillingDate", () => {
		expect(billingAccess(row({ hasPaymentMethod: true }), at(14 * DAY))).toEqual({
			state: "trialing",
			locked: false,
			hasPaymentMethod: true,
			trialEndsAt,
			trialDaysLeft: 1,
			nextChargeAt: trialEndsAt,
		});
	});

	it("active from trialEndsAt, next charge at nextBillingDate", () => {
		const nextBillingDate = at(45 * DAY);
		expect(billingAccess(row({ hasPaymentMethod: true, nextBillingDate }), trialEndsAt)).toEqual({
			state: "active",
			locked: false,
			hasPaymentMethod: true,
			trialEndsAt,
			nextChargeAt: nextBillingDate,
		});
	});
});
