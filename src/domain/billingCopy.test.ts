import { describe, expect, it } from "vitest";
import type { BillingAccess } from "./billing";
import {
	cancelAccessUntil,
	cardLabel,
	formatBillingDate,
	formatMoney,
	formatOwnerNames,
	headline,
	invoiceStatusLabel,
	lockCopy,
	lockScreenCopy,
	primaryAction,
	priceLabel,
} from "./billingCopy";

const TRIAL_END = new Date("2026-11-29T10:00:00.000Z");
const base = { hasPaymentMethod: false, trialEndsAt: TRIAL_END, locked: false } as const;
const ctx = { orgName: "Patel_Samaj", price: "$5" };

const trialNoCard: BillingAccess = { ...base, state: "trialing", trialDaysLeft: 15 };
const trialCard: BillingAccess = {
	...base,
	state: "trialing",
	trialDaysLeft: 9,
	hasPaymentMethod: true,
	nextChargeAt: new Date("2026-11-23T10:00:00.000Z"),
};
const active: BillingAccess = {
	...base,
	state: "active",
	hasPaymentMethod: true,
	nextChargeAt: new Date("2026-12-03T10:00:00.000Z"),
};
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
	graceEndsAt: new Date("2026-11-19T10:00:00.000Z"),
};
const pending: BillingAccess = { ...base, state: "pending", hasPaymentMethod: true };
const locked = (lockReason: BillingAccess["lockReason"]): BillingAccess => ({
	...base,
	state: "locked",
	locked: true,
	lockReason,
});

describe("formatting", () => {
	it("dates read like 'Nov 29, 2026' in UTC (same on server and client)", () => {
		expect(formatBillingDate(new Date("2026-11-29T23:30:00.000Z"))).toBe("Nov 29, 2026");
	});

	it("price comes from the pre-tax cents, $5 when unknown", () => {
		expect(priceLabel(500)).toBe("$5");
		expect(priceLabel(750)).toBe("$7.50");
		expect(priceLabel(null)).toBe("$5");
	});

	it("money shows two decimals with the currency", () => {
		expect(formatMoney(500, "USD")).toBe("$5.00");
		expect(formatMoney(41_500, "INR")).toBe("₹415.00");
	});

	it("card reads like 'Visa •••• 4242, exp 08/28'", () => {
		expect(cardLabel({ network: "Visa", last4: "4242", expMonth: "8", expYear: "2028" })).toBe(
			"Visa •••• 4242, exp 08/28"
		);
		expect(cardLabel({ network: null, last4: "4242", expMonth: null, expYear: null })).toBe(
			"Card •••• 4242"
		);
	});

	it("owner names join with commas", () => {
		expect(formatOwnerNames(["Nisarg Bhatt", "Asha Patel"])).toBe("Nisarg Bhatt, Asha Patel");
	});

	it("invoice status: succeeded is Paid", () => {
		expect(invoiceStatusLabel("succeeded")).toBe("Paid");
		expect(invoiceStatusLabel("failed")).toBe("Failed");
		expect(invoiceStatusLabel("processing")).toBe("Processing");
		expect(invoiceStatusLabel("requires_payment_method")).toBe("Unpaid");
	});
});

describe("headline", () => {
	it("trialing, no card: days left + lock warning", () => {
		expect(headline(trialNoCard, ctx)).toEqual({
			title: "15 days left in your free trial",
			body: "Trial ends Nov 29, 2026. No charge unless you add payment details. Without them, the organization locks on that date.",
		});
		expect(headline({ ...trialNoCard, trialDaysLeft: 1 }, ctx).title).toBe(
			"1 day left in your free trial"
		);
	});

	it("trialing + card: first charge date", () => {
		expect(headline(trialCard, ctx)).toEqual({
			title: "Trial ends Nov 29, 2026",
			body: "Your card is saved. First charge of $5 on Nov 23, 2026. No charge before then.",
		});
	});

	it("active / canceling / grace / pending", () => {
		expect(headline(active, ctx)).toEqual({
			title: "Standard · $5/month",
			body: "Next charge $5 on Dec 3, 2026.",
		});
		expect(headline(canceling, ctx).title).toBe("Access until Dec 3, 2026");
		expect(headline(grace, ctx)).toEqual({
			title: "We couldn't charge your card",
			body: "We'll retry automatically. Update your payment details before Nov 19, 2026 to avoid a lock.",
		});
		expect(headline(pending, ctx).title).toBe("Confirming your payment…");
	});

	it("locked uses the lock copy", () => {
		expect(headline(locked("canceled"), ctx)).toEqual(lockCopy("canceled", ctx));
		expect(lockCopy("trial_ended", ctx)).toEqual({
			title: "Your free trial has ended",
			body: "Subscribe for $5/month to keep using Patel_Samaj.",
		});
	});
});

describe("primaryAction", () => {
	it("maps each state to its one button", () => {
		expect(primaryAction(trialNoCard, ctx)).toEqual({
			kind: "portal",
			label: "Add payment details",
		});
		expect(primaryAction(trialCard, ctx)).toEqual({ kind: "portal", label: "Manage payment" });
		expect(primaryAction(active, ctx)).toEqual({ kind: "portal", label: "Manage payment" });
		expect(primaryAction(canceling, ctx)).toEqual({
			kind: "resume",
			label: "Resume subscription",
		});
		expect(primaryAction(grace, ctx)).toEqual({
			kind: "portal",
			label: "Update payment details",
			destructive: true,
		});
		expect(primaryAction(pending, ctx)).toBeNull();
	});

	it("locked: card fix or subscribe; ended sub needs a new checkout", () => {
		expect(primaryAction(locked("payment_failed"), ctx)).toEqual({
			kind: "portal",
			label: "Update payment details",
		});
		expect(primaryAction(locked("trial_ended"), ctx)).toEqual({
			kind: "portal",
			label: "Subscribe · $5/month",
		});
		expect(primaryAction(locked("canceled"), ctx)).toEqual({
			kind: "checkout",
			label: "Subscribe · $5/month",
		});
	});
});

describe("cancelAccessUntil", () => {
	it("trialing: until the trial ends; active: until next charge", () => {
		expect(cancelAccessUntil(trialNoCard)).toBe("the trial ends (Nov 29, 2026)");
		expect(cancelAccessUntil(active)).toBe("Dec 3, 2026");
	});

	it("no cancel zone outside trialing / active", () => {
		for (const a of [canceling, grace, pending, locked("canceled")]) {
			expect(cancelAccessUntil(a)).toBeNull();
		}
	});
});

describe("lockScreenCopy", () => {
	const owners = ["Asha", "Chetan"];

	it("owner → lockCopy for the reason", () => {
		expect(lockScreenCopy("canceled", { ...ctx, owner: true, ownerNames: owners })).toEqual({
			title: "Subscription ended",
			body: "Re-subscribe for $5/month to pick up where you left off.",
		});
	});

	it("member, trial ended / canceled → ask an owner to subscribe", () => {
		const c = lockScreenCopy("trial_ended", {
			orgName: "Patel_Samaj",
			owner: false,
			ownerNames: owners,
		});
		expect(c).toEqual({
			title: "Patel_Samaj is locked",
			body: "An owner needs to subscribe before anyone can use it. Owners: Asha, Chetan.",
		});
	});

	it("member, payment failed → ask an owner to update payment details", () => {
		expect(
			lockScreenCopy("payment_failed", { orgName: "Patel_Samaj", owner: false, ownerNames: owners })
				.body
		).toBe(
			"An owner needs to update the payment details before anyone can use it. Owners: Asha, Chetan."
		);
	});
});
