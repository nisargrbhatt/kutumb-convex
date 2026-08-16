import type Stripe from "stripe";

/**
 * `subscription_data.metadata.referenceId` is set at checkout creation
 * (checkout-session-params.ts) and Stripe carries it for the subscription's whole lifecycle,
 * including on `customer.subscription.deleted`. Missing it means the subscription didn't
 * originate from our checkout (e.g. created by hand in the Stripe dashboard) — an anomaly we
 * want surfaced via retries, not silently dropped (16-webhook-lifecycle.md §3).
 */
export function requireReferenceId(sub: Stripe.Subscription): string {
	const referenceId = sub.metadata.referenceId;

	if (!referenceId) {
		throw new Error(`stripe webhook: subscription ${sub.id} has no referenceId metadata`);
	}

	return referenceId;
}

/**
 * Maps a freshly-retrieved Stripe subscription to the plugin's verbatim `subscription` row
 * columns (11-stripe-plugin-and-schema.md). Called with **current** truth on every subscription
 * event, so replays and out-of-order delivery converge to the same row
 * (16-webhook-lifecycle.md). `plan` is constant — one flat plan (auth.ts's `stripe()` config).
 */
export function fromStripe(sub: Stripe.Subscription) {
	const item = sub.items.data[0];

	return {
		plan: "org",
		stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
		stripeSubscriptionId: sub.id,
		status: sub.status,
		periodStart: item ? new Date(item.current_period_start * 1000) : null,
		periodEnd: item ? new Date(item.current_period_end * 1000) : null,
		cancelAtPeriodEnd: sub.cancel_at_period_end,
		cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
		canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
		endedAt: sub.ended_at ? new Date(sub.ended_at * 1000) : null,
		billingInterval: item?.price.recurring?.interval ?? null,
	};
}
