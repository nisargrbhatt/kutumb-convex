import { describe, expect, it } from "vitest";
import type { BillingAccess } from "./billing";
import { bannerFor } from "./billingBanner";

const TRIAL_END = new Date("2026-11-29T10:00:00.000Z");
const base = { hasPaymentMethod: false, trialEndsAt: TRIAL_END, locked: false } as const;
const ctx = { orgName: "Patel_Samaj", price: "$5", ownerNames: ["Asha Patel", "Ravi Shah"] };

const trialNoCard = (days: number): BillingAccess => ({
	...base,
	state: "trialing",
	trialDaysLeft: days,
});
const trialCard: BillingAccess = {
	...base,
	state: "trialing",
	trialDaysLeft: 2,
	hasPaymentMethod: true,
	nextChargeAt: new Date("2026-11-23T10:00:00.000Z"),
};
const pending: BillingAccess = { ...base, state: "pending" };
const active: BillingAccess = { ...base, state: "active", hasPaymentMethod: true };
const canceling: BillingAccess = {
	...base,
	state: "canceling",
	hasPaymentMethod: true,
	accessEndsAt: new Date("2026-12-03T10:00:00.000Z"),
};
const grace: BillingAccess = {
	...base,
	state: "grace",
	hasPaymentMethod: true,
	graceEndsAt: new Date("2026-12-06T10:00:00.000Z"),
};
const locked: BillingAccess = {
	...base,
	state: "locked",
	locked: true,
	lockReason: "trial_ended",
};

describe("bannerFor: owner", () => {
	it("trialing, no card: days left + Add payment, info", () => {
		expect(bannerFor(trialNoCard(9), "owner", ctx)).toEqual({
			state: "trialing",
			tone: "info",
			text: "9 days left in trial · no charge unless you add payment details",
			action: { kind: "portal", label: "Add payment" },
		});
	});

	it("trialing, no card, ≤3 days: warning; singular day", () => {
		expect(bannerFor(trialNoCard(3), "owner", ctx)?.tone).toBe("warning");
		expect(bannerFor(trialNoCard(1), "owner", ctx)?.text).toBe(
			"1 day left in trial · no charge unless you add payment details"
		);
	});

	it("trialing + card: first charge, no CTA, info", () => {
		expect(bannerFor(trialCard, "owner", ctx)).toEqual({
			state: "trialing",
			tone: "info",
			text: "Trial · first charge $5 on Nov 23, 2026",
			action: null,
		});
	});

	it("pending: confirming, no CTA", () => {
		expect(bannerFor(pending, "owner", ctx)).toEqual({
			state: "pending",
			tone: "info",
			text: "Confirming your payment…",
			action: null,
		});
	});

	it("canceling: access until + Resume, warning", () => {
		expect(bannerFor(canceling, "owner", ctx)).toEqual({
			state: "canceling",
			tone: "warning",
			text: "Subscription canceled · access until Dec 3, 2026",
			action: { kind: "resume", label: "Resume" },
		});
	});

	it("grace: update before date + Update payment, danger", () => {
		expect(bannerFor(grace, "owner", ctx)).toEqual({
			state: "grace",
			tone: "danger",
			text: "Payment failed · update payment details before Dec 6, 2026 to avoid a lock",
			action: { kind: "portal", label: "Update payment" },
		});
	});

	it("owner in a multi-role string counts as owner", () => {
		expect(bannerFor(grace, "admin,owner", ctx)?.action?.label).toBe("Update payment");
	});

	it("active / locked: nothing", () => {
		expect(bannerFor(active, "owner", ctx)).toBeNull();
		expect(bannerFor(locked, "owner", ctx)).toBeNull();
	});
});

describe("bannerFor: admin / member", () => {
	it.each(["admin", "member"])("%s, trialing no card ≤3 days: heads-up with owners", (role) => {
		expect(bannerFor(trialNoCard(3), role, ctx)).toEqual({
			state: "trialing",
			tone: "warning",
			text: "Patel_Samaj's trial ends Nov 29, 2026. An owner (Asha Patel, Ravi Shah) needs to add payment details.",
			action: null,
		});
	});

	it.each(["admin", "member"])("%s, grace: needs attention, danger", (role) => {
		expect(bannerFor(grace, role, ctx)).toEqual({
			state: "grace",
			tone: "danger",
			text: "Billing for Patel_Samaj needs attention. Ask an owner (Asha Patel, Ravi Shah).",
			action: null,
		});
	});

	it("nothing for early trial, card trial, pending, canceling, active, locked", () => {
		for (const a of [trialNoCard(4), trialCard, pending, canceling, active, locked]) {
			expect(bannerFor(a, "member", ctx)).toBeNull();
		}
	});

	it("never mentions a price", () => {
		const all = [trialNoCard(1), trialCard, pending, canceling, grace, active, locked];
		for (const a of all) {
			expect(bannerFor(a, "admin", ctx)?.text ?? "").not.toContain("$");
		}
	});
});
