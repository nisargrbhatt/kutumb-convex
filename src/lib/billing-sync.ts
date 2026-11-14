import { eq } from "drizzle-orm";
import type DodoPayments from "dodopayments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { orgBilling } from "@/db/schema";
import type { QueryDb } from "@/domain/queries/db";

const DAY_MS = 86_400_000;

type OrgBillingRow = typeof orgBilling.$inferSelect;

/** Dodo-mirrored columns of `orgBilling` from one Subscription. `pastDueEndsAt` is webhook-only. */
export function subscriptionColumns(sub: Subscription, syncedAt: Date) {
	return {
		subscriptionId: sub.subscription_id,
		status: sub.status,
		trialEndsAt: new Date(new Date(sub.created_at).getTime() + sub.trial_period_days * DAY_MS),
		nextBillingDate: sub.next_billing_date ? new Date(sub.next_billing_date) : null,
		cancelAtNextBillingDate: sub.cancel_at_next_billing_date,
		hasPaymentMethod: sub.has_payment_method,
		recurringPreTaxAmount: sub.recurring_pre_tax_amount,
		needsSubscription: false,
		syncedAt,
	} satisfies Partial<OrgBillingRow>;
}

/**
 * Retrieve `subscriptionId` from Dodo and overwrite the org's `orgBilling` row with it
 * (order-independent: always the latest Dodo state). Throws on Dodo failure. Returns the new row.
 */
export async function pullSubscriptionIntoRow({
	db,
	dodo,
	organizationId,
	subscriptionId,
	now = () => new Date(),
}: {
	db: QueryDb;
	dodo: Pick<DodoPayments, "subscriptions">;
	organizationId: string;
	subscriptionId: string;
	now?: () => Date;
}): Promise<OrgBillingRow | undefined> {
	const sub = await dodo.subscriptions.retrieve(subscriptionId);
	const [row] = await db
		.update(orgBilling)
		.set(subscriptionColumns(sub, now()))
		.where(eq(orgBilling.organizationId, organizationId))
		.returning();
	return row;
}
