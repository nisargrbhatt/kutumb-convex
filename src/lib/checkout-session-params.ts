import type Stripe from "stripe";

/**
 * Shared with src/api/billing.ts's 409 throw and the checkout route's client-side error handling —
 * kept here (not billing.ts) for the same cloudflare:workers-poisons-the-client-bundle reason as
 * BILLING_STATUS_ROUTE (ticket 13).
 */
export const DUPLICATE_SUBSCRIPTION_ERROR_MESSAGE =
	"Organization already has a subscription in progress";

/**
 * Reproduces @better-auth/stripe's undocumented metadata contract exactly — read off its dist,
 * not its docs (ticket 14). Every field here is load-bearing:
 * - ui_mode "embedded_page" (not "embedded", renamed in API 2026-03-25.dahlia).
 * - no success_url/cancel_url/customer_creation/trial_period_days — illegal or plan-irrelevant here.
 * - metadata.subscriptionId — checkout.session.completed no-ops without it.
 * - subscription_data.metadata.subscriptionId — customer.subscription.created double-writes without it.
 *
 * Kept apart from src/api/billing.ts because that file imports db, which pulls in
 * cloudflare:workers and poisons any vitest importer (mirrors billing-status-map.ts).
 */
export function buildCheckoutSessionParams({
	orgId,
	userId,
	subscriptionId,
	priceId,
	customerId,
	returnUrl,
}: {
	orgId: string;
	userId: string;
	subscriptionId: string;
	priceId: string;
	customerId: string;
	returnUrl: string;
}): Stripe.Checkout.SessionCreateParams {
	const metadata = { userId, subscriptionId, referenceId: orgId };

	return {
		mode: "subscription",
		ui_mode: "embedded_page",
		customer: customerId,
		line_items: [{ price: priceId, quantity: 1 }],
		client_reference_id: orgId,
		metadata,
		subscription_data: { metadata },
		return_url: returnUrl,
	};
}
