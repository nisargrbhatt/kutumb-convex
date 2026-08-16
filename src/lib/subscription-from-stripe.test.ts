import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { fromStripe, requireReferenceId } from "./subscription-from-stripe";

function fakeSubscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
	return {
		id: "sub_1",
		customer: "cus_1",
		status: "active",
		metadata: { referenceId: "org_1" },
		cancel_at_period_end: false,
		cancel_at: null,
		canceled_at: null,
		ended_at: null,
		items: {
			object: "list",
			data: [
				{
					id: "si_1",
					current_period_start: 1700000000,
					current_period_end: 1702592000,
					price: { recurring: { interval: "month" } },
				},
			],
			has_more: false,
			url: "/v1/subscription_items",
		},
		...overrides,
	} as unknown as Stripe.Subscription;
}

describe("requireReferenceId", () => {
	it("returns metadata.referenceId when present", () => {
		expect(requireReferenceId(fakeSubscription())).toBe("org_1");
	});

	it("throws when metadata.referenceId is missing", () => {
		expect(() => requireReferenceId(fakeSubscription({ metadata: {} }))).toThrow(
			/no referenceId metadata/
		);
	});
});

describe("fromStripe", () => {
	it("maps status, plan, and Stripe ids", () => {
		const result = fromStripe(fakeSubscription({ status: "past_due" }));

		expect(result.status).toBe("past_due");
		expect(result.plan).toBe("org");
		expect(result.stripeSubscriptionId).toBe("sub_1");
		expect(result.stripeCustomerId).toBe("cus_1");
	});

	it("extracts customer id when customer is an expanded object", () => {
		const result = fromStripe(fakeSubscription({ customer: { id: "cus_2" } as Stripe.Customer }));

		expect(result.stripeCustomerId).toBe("cus_2");
	});

	it("derives periodStart/periodEnd and billingInterval from the first item", () => {
		const result = fromStripe(fakeSubscription());

		expect(result.periodStart).toEqual(new Date(1700000000 * 1000));
		expect(result.periodEnd).toEqual(new Date(1702592000 * 1000));
		expect(result.billingInterval).toBe("month");
	});

	it("nulls periodStart/periodEnd/billingInterval when there is no item", () => {
		const result = fromStripe(fakeSubscription({ items: { data: [] } as never }));

		expect(result.periodStart).toBeNull();
		expect(result.periodEnd).toBeNull();
		expect(result.billingInterval).toBeNull();
	});

	it("maps cancel_at/canceled_at/ended_at to Dates when present, null otherwise", () => {
		const withDates = fromStripe(
			fakeSubscription({ cancel_at: 1700000000, canceled_at: 1700000001, ended_at: 1700000002 })
		);

		expect(withDates.cancelAt).toEqual(new Date(1700000000 * 1000));
		expect(withDates.canceledAt).toEqual(new Date(1700000001 * 1000));
		expect(withDates.endedAt).toEqual(new Date(1700000002 * 1000));

		const withoutDates = fromStripe(fakeSubscription());
		expect(withoutDates.cancelAt).toBeNull();
		expect(withoutDates.canceledAt).toBeNull();
		expect(withoutDates.endedAt).toBeNull();
	});

	it("carries cancelAtPeriodEnd through", () => {
		expect(fromStripe(fakeSubscription({ cancel_at_period_end: true })).cancelAtPeriodEnd).toBe(
			true
		);
	});
});
