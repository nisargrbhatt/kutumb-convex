import { describe, expect, it } from "vitest";
import { buildCheckoutSessionParams } from "./checkout-session-params";

describe("buildCheckoutSessionParams", () => {
	const args = {
		orgId: "org_1",
		userId: "user_1",
		subscriptionId: "sub_1",
		priceId: "price_1",
		customerId: "cus_1",
		returnUrl: "https://app.example.com/onboarding/checkout?confirming=1",
	};

	it("mints an embedded subscription checkout session", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.mode).toBe("subscription");
		expect(params.ui_mode).toBe("embedded_page");
	});

	it("uses embedded_page, not embedded (renamed in API 2026-03-25.dahlia)", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.ui_mode).not.toBe("embedded");
	});

	it("sets client_reference_id to the org id", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.client_reference_id).toBe("org_1");
	});

	it("carries userId/subscriptionId/referenceId in session metadata", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.metadata).toEqual({
			userId: "user_1",
			subscriptionId: "sub_1",
			referenceId: "org_1",
		});
	});

	it("carries userId/subscriptionId/referenceId in subscription_data.metadata", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.subscription_data?.metadata).toEqual({
			userId: "user_1",
			subscriptionId: "sub_1",
			referenceId: "org_1",
		});
	});

	it("never sets success_url/cancel_url/customer_creation/trial_period_days", () => {
		const params = buildCheckoutSessionParams(args) as Record<string, unknown>;

		expect(params.success_url).toBeUndefined();
		expect(params.cancel_url).toBeUndefined();
		expect(params.customer_creation).toBeUndefined();
		expect(params.trial_period_days).toBeUndefined();
	});

	it("sets customer, line item, and return_url from the given args", () => {
		const params = buildCheckoutSessionParams(args);

		expect(params.customer).toBe("cus_1");
		expect(params.line_items).toEqual([{ price: "price_1", quantity: 1 }]);
		expect(params.return_url).toBe(args.returnUrl);
	});
});
