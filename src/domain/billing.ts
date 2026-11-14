import type { orgBilling } from "@/db/schema";

/** The `orgBilling` columns access depends on; a full row satisfies it. */
export type OrgBillingRow = Pick<
	typeof orgBilling.$inferSelect,
	| "status"
	| "trialEndsAt"
	| "nextBillingDate"
	| "cancelAtNextBillingDate"
	| "pastDueEndsAt"
	| "hasPaymentMethod"
	| "needsSubscription"
>;

export type BillingState = "pending" | "trialing" | "active" | "canceling" | "grace" | "locked";
export type LockReason = "trial_ended" | "payment_failed" | "canceled";

export type BillingAccess = {
	state: BillingState;
	locked: boolean;
	lockReason?: LockReason;
	hasPaymentMethod: boolean;
	trialEndsAt: Date;
	/** Trialing only, ceil. */
	trialDaysLeft?: number;
	/** Grace only. */
	graceEndsAt?: Date;
	/** Canceling only. */
	accessEndsAt?: Date;
	/** Trialing + card, active. */
	nextChargeAt?: Date;
};

const DAY_MS = 86_400_000;

/**
 * What an org may do right now, from its mirrored Dodo row (spec: billing > State). Pure; Lock is
 * computed here, never stored. First matching rule wins.
 */
export function billingAccess(row: OrgBillingRow, now: Date): BillingAccess {
	const base = { hasPaymentMethod: row.hasPaymentMethod, trialEndsAt: row.trialEndsAt };
	const locked = (lockReason: LockReason): BillingAccess => ({
		state: "locked",
		locked: true,
		lockReason,
		...base,
	});
	const trialing = (): BillingAccess => ({
		state: "trialing",
		locked: false,
		...base,
		trialDaysLeft: Math.ceil((row.trialEndsAt.getTime() - now.getTime()) / DAY_MS),
	});

	if (row.needsSubscription) return now < row.trialEndsAt ? trialing() : locked("trial_ended");

	switch (row.status) {
		case "pending":
			return { state: "pending", locked: false, ...base };
		case "cancelled":
		case "expired":
		case "failed":
		case "paused":
			return locked("canceled");
		case "on_hold":
			return locked(row.hasPaymentMethod ? "payment_failed" : "trial_ended");
		case "past_due":
			// No end known: Dodo moves the sub to `on_hold` when its window ends.
			if (!row.pastDueEndsAt) return { state: "grace", locked: false, ...base };
			return now < row.pastDueEndsAt
				? { state: "grace", locked: false, ...base, graceEndsAt: row.pastDueEndsAt }
				: locked("payment_failed");
		case "active": {
			const next = row.nextBillingDate ?? undefined;
			if (row.cancelAtNextBillingDate) {
				// Unknown end: stay open until Dodo reports the cancellation (never a false Lock).
				if (!next) return { state: "canceling", locked: false, ...base };
				return now < next
					? { state: "canceling", locked: false, ...base, accessEndsAt: next }
					: locked("canceled");
			}
			if (now < row.trialEndsAt) {
				return row.hasPaymentMethod
					? { ...trialing(), nextChargeAt: next ?? row.trialEndsAt }
					: trialing();
			}
			return { state: "active", locked: false, ...base, ...(next && { nextChargeAt: next }) };
		}
	}

	// `needsSubscription: false` with no status: shouldn't happen; default-deny.
	return locked("trial_ended");
}
