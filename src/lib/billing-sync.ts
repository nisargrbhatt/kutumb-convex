import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { orgBilling } from "@/db/schema";

type Db = BaseSQLiteDatabase<"async", any, any>;
export type OrgBillingRecord = typeof orgBilling.$inferSelect;

/** The one Dodo read the mirror needs; `DodoPayments` satisfies it. */
export type DodoSubscriptions = {
	subscriptions: { retrieve(id: string): PromiseLike<Subscription> };
};

const DAY_MS = 86_400_000;

/**
 * Pull `subscriptionId` from Dodo and overwrite the org's `orgBilling` row with it (it becomes the
 * row's current sub). Order-independent: the row ends in Dodo's latest state whatever event
 * triggered it. `pastDueEndsAt` comes from a webhook payload only (GET lacks it); kept while the sub
 * stays `past_due`, cleared otherwise. Dodo errors propagate. Returns the new row, or null if the
 * org has no row.
 */
export async function pullSubscriptionIntoRow(
	db: Db,
	dodo: DodoSubscriptions,
	args: {
		organizationId: string;
		subscriptionId: string;
		pastDueEndsAt?: Date;
		now?: Date;
	}
): Promise<OrgBillingRecord | null> {
	const sub = await dodo.subscriptions.retrieve(args.subscriptionId);
	const pastDue = sub.status === "past_due";
	const [row] = await db
		.update(orgBilling)
		.set({
			subscriptionId: sub.subscription_id,
			dodoCustomerId: sub.customer.customer_id,
			status: sub.status,
			trialEndsAt: new Date(Date.parse(sub.created_at) + sub.trial_period_days * DAY_MS),
			nextBillingDate: new Date(sub.next_billing_date),
			cancelAtNextBillingDate: sub.cancel_at_next_billing_date,
			hasPaymentMethod: sub.has_payment_method,
			recurringPreTaxAmount: sub.recurring_pre_tax_amount,
			needsSubscription: false,
			syncedAt: args.now ?? new Date(),
			...(!pastDue
				? { pastDueEndsAt: null }
				: args.pastDueEndsAt && { pastDueEndsAt: args.pastDueEndsAt }),
		})
		.where(eq(orgBilling.organizationId, args.organizationId))
		.returning();
	return row ?? null;
}
