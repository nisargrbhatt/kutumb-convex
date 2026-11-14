import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { orgBilling } from "@/db/schema";
import { billingAccess } from "@/domain/billing";

type Db = BaseSQLiteDatabase<"async", any, any>;
export type OrgBillingRecord = typeof orgBilling.$inferSelect;

/** The one Dodo read the mirror needs; `DodoPayments` satisfies it. */
export type DodoSubscriptions = {
	subscriptions: { retrieve(id: string): PromiseLike<Subscription> };
};

const DAY_MS = 86_400_000;

/**
 * `past_due`: the payload's end, else keep. `on_hold` (grace ran out): keep, it's the Lock date.
 * Anything else: cleared.
 */
const pastDueEndsAtFor = (status: Subscription["status"], fromPayload?: Date) => {
	if (status === "past_due") return fromPayload ? { pastDueEndsAt: fromPayload } : {};
	return status === "on_hold" ? {} : { pastDueEndsAt: null };
};

/**
 * Pull `subscriptionId` from Dodo and overwrite the org's `orgBilling` row with it (it becomes the
 * row's current sub). Order-independent: the row ends in Dodo's latest state whatever event
 * triggered it. `pastDueEndsAt` comes from a webhook payload only (GET lacks it); kept while the sub
 * stays `past_due` or moves to `on_hold`, cleared otherwise; `lockedAt` tracks Lock. Dodo errors propagate. Returns the new row, or null if the
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
	const now = args.now ?? new Date();
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
			syncedAt: now,
			...pastDueEndsAtFor(sub.status, args.pastDueEndsAt),
		})
		.where(eq(orgBilling.organizationId, args.organizationId))
		.returning();
	if (!row) return null;

	// `lockedAt`: set once on the first locked pull, cleared on unlock (stable `locked` anchor).
	const { locked } = billingAccess(row, now);
	if (locked === !!row.lockedAt) return row;
	const lockedAt = locked ? now : null;
	await db
		.update(orgBilling)
		.set({ lockedAt })
		.where(eq(orgBilling.organizationId, args.organizationId));
	return { ...row, lockedAt };
}
