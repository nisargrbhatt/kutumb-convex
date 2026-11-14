import type { DodoSubscriptionStatus } from "@/db/constants";
import type { BillingAccess } from "./billing";

/** Dodo statuses a sub never leaves; re-subscribing means a new sub id. */
const TERMINAL: ReadonlySet<DodoSubscriptionStatus> = new Set(["cancelled", "expired", "failed"]);

export const isTerminalStatus = (status: DodoSubscriptionStatus | null | undefined) =>
	!!status && TERMINAL.has(status);

/**
 * What a webhook about `incoming` should do to the org's row (spec: Webhook step 5). Its own sub →
 * `current`; another sub is adopted only when the row has no sub or a terminal one (re-subscribe
 * checkout) and the incoming sub isn't terminal itself; anything else is a stray → `ignore`.
 */
export function subscriptionEventTarget(
	row: { subscriptionId: string | null; status: DodoSubscriptionStatus | null },
	incoming: { subscriptionId: string; status?: DodoSubscriptionStatus }
): "current" | "adopt" | "ignore" {
	if (incoming.subscriptionId === row.subscriptionId) return "current";
	if (isTerminalStatus(incoming.status)) return "ignore";
	return !row.subscriptionId || isTerminalStatus(row.status) ? "adopt" : "ignore";
}

/**
 * Access transitions worth reporting, old → new (spec: Webhook step 7, Analytics). `grace_started`
 * is the hook for the grace-start email (Reminders).
 */
export type BillingAccessEvent = "subscribed" | "payment_failed" | "grace_started" | "canceled";

/** Server-side PostHog billing events (spec: Analytics); `billing_locked` from the sweep. */
export type BillingAnalyticsEvent =
	| "billing_locked"
	| "billing_subscribed"
	| "billing_payment_failed"
	| "billing_canceled"
	| "billing_resubscribed";

export function diffBillingAccess(
	before: BillingAccess,
	after: BillingAccess
): BillingAccessEvent[] {
	const events: BillingAccessEvent[] = [];
	if (!before.hasPaymentMethod && after.hasPaymentMethod) events.push("subscribed");
	const enteredGrace = after.state === "grace" && before.state !== "grace";
	const paymentLock = (x: BillingAccess) => x.lockReason === "payment_failed";
	// grace → locked/payment_failed is the same failure: report it once.
	if (enteredGrace || (paymentLock(after) && !paymentLock(before) && before.state !== "grace")) {
		events.push("payment_failed");
	}
	if (enteredGrace) events.push("grace_started");
	if (after.state === "canceling" && before.state !== "canceling") events.push("canceled");
	return events;
}
