import type { BillingAccess, BillingState, LockReason } from "./billing";

/**
 * Billing copy shared by the billing page, banner and `/locked` (ported from the billing UX
 * prototype, Variant A). Pure, client-safe.
 */

export type BillingCopyContext = { orgName: string; price: string };
export type Copy = { title: string; body: string };

/** "Nov 29, 2026", in UTC so SSR and the browser agree. */
export const formatBillingDate = (d: Date) =>
	d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

export const formatMoney = (cents: number, currency: string) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

/** The plan price, pre-tax USD ("$5"); `$5` until Dodo reports `recurringPreTaxAmount`. */
export function priceLabel(recurringPreTaxAmount: number | null | undefined) {
	const cents = recurringPreTaxAmount ?? 500;
	return cents % 100 === 0 ? `$${cents / 100}` : formatMoney(cents, "USD");
}

export type CardSummary = {
	network: string | null;
	last4: string | null;
	expMonth: string | null;
	expYear: string | null;
};

/** "Visa •••• 4242, exp 08/28". */
export function cardLabel(c: CardSummary) {
	const name = `${c.network ?? "Card"} •••• ${c.last4 ?? "····"}`;
	if (!c.expMonth || !c.expYear) return name;
	return `${name}, exp ${c.expMonth.padStart(2, "0")}/${c.expYear.slice(-2)}`;
}

export const formatOwnerNames = (names: readonly string[]) => names.join(", ");

const INVOICE_STATUS: Record<string, string> = {
	succeeded: "Paid",
	failed: "Failed",
	cancelled: "Canceled",
	processing: "Processing",
};
export const invoiceStatusLabel = (status: string) => INVOICE_STATUS[status] ?? "Unpaid";

export const STATUS_BADGE: Record<
	BillingState,
	{ badge: string; tone: "default" | "secondary" | "destructive" | "outline" }
> = {
	pending: { badge: "Processing", tone: "secondary" },
	trialing: { badge: "Free trial", tone: "secondary" },
	active: { badge: "Active", tone: "default" },
	canceling: { badge: "Canceled", tone: "outline" },
	grace: { badge: "Payment failed", tone: "destructive" },
	locked: { badge: "Locked", tone: "destructive" },
};

const date = (d: Date | undefined) => (d ? formatBillingDate(d) : "the end of the period");

export function headline(a: BillingAccess, ctx: BillingCopyContext): Copy {
	const { price } = ctx;
	switch (a.state) {
		case "pending":
			return {
				title: "Confirming your payment…",
				body: "This usually takes a few seconds. The page updates on its own.",
			};
		case "trialing": {
			const ends = formatBillingDate(a.trialEndsAt);
			if (a.hasPaymentMethod) {
				return {
					title: `Trial ends ${ends}`,
					body: `Your card is saved. First charge of ${price} on ${date(a.nextChargeAt ?? a.trialEndsAt)}. No charge before then.`,
				};
			}
			const n = a.trialDaysLeft ?? 0;
			return {
				title: `${n} ${n === 1 ? "day" : "days"} left in your free trial`,
				body: `Trial ends ${ends}. No charge unless you add payment details. Without them, the organization locks on that date.`,
			};
		}
		case "active":
			return {
				title: `Standard · ${price}/month`,
				body: `Next charge ${price} on ${date(a.nextChargeAt)}.`,
			};
		case "canceling":
			return {
				title: `Access until ${date(a.accessEndsAt)}`,
				body: "Your subscription won't renew. After that date the organization locks. Your data is kept and you can re-subscribe any time.",
			};
		case "grace":
			return {
				title: "We couldn't charge your card",
				body: a.graceEndsAt
					? `We'll retry automatically. Update your payment details before ${formatBillingDate(a.graceEndsAt)} to avoid a lock.`
					: "We'll retry automatically. Update your payment details to avoid a lock.",
			};
		case "locked":
			return lockCopy(a.lockReason ?? "trial_ended", ctx);
	}
}

export function lockCopy(r: LockReason, { orgName, price }: BillingCopyContext): Copy {
	switch (r) {
		case "trial_ended":
			return {
				title: "Your free trial has ended",
				body: `Subscribe for ${price}/month to keep using ${orgName}.`,
			};
		case "payment_failed":
			return {
				title: "Payment failed",
				body: "We couldn't charge your card after several tries. Update your payment details to unlock right away.",
			};
		case "canceled":
			return {
				title: "Subscription ended",
				body: `Re-subscribe for ${price}/month to pick up where you left off.`,
			};
	}
}

/** `/locked` title + body: owners get `lockCopy`; members are told which owners to ask. */
export function lockScreenCopy(
	r: LockReason,
	{
		orgName,
		price,
		owner,
		ownerNames,
	}: { orgName: string; price?: string; owner: boolean; ownerNames: readonly string[] }
): Copy {
	if (owner) return lockCopy(r, { orgName, price: price ?? "$5" });
	const need = r === "payment_failed" ? "update the payment details" : "subscribe";
	return {
		title: `${orgName} is locked`,
		body: `An owner needs to ${need} before anyone can use it. Owners: ${formatOwnerNames(ownerNames)}.`,
	};
}

/** What the state's one button does: Dodo portal, resume, or a new checkout (ended sub). */
export type BillingAction = {
	kind: "portal" | "resume" | "checkout";
	label: string;
	destructive?: true;
};

export function primaryAction(
	a: BillingAccess,
	{ price }: BillingCopyContext
): BillingAction | null {
	switch (a.state) {
		case "pending":
			return null;
		case "trialing":
			return {
				kind: "portal",
				label: a.hasPaymentMethod ? "Manage payment" : "Add payment details",
			};
		case "active":
			return { kind: "portal", label: "Manage payment" };
		case "canceling":
			return { kind: "resume", label: "Resume subscription" };
		case "grace":
			return { kind: "portal", label: "Update payment details", destructive: true };
		case "locked":
			if (a.lockReason === "payment_failed") {
				return { kind: "portal", label: "Update payment details" };
			}
			return {
				kind: a.lockReason === "canceled" ? "checkout" : "portal",
				label: `Subscribe · ${price}/month`,
			};
	}
}

/** Cancel zone's "You keep access until …"; `null` = no cancel zone (only trialing / active). */
export function cancelAccessUntil(a: BillingAccess): string | null {
	if (a.state === "trialing") return `the trial ends (${formatBillingDate(a.trialEndsAt)})`;
	if (a.state === "active") return date(a.nextChargeAt);
	return null;
}
