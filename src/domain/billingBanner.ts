import type { BillingAccess, BillingState } from "./billing";
import { formatBillingDate, formatOwnerNames } from "./billingCopy";
import { isOwnerRole } from "./permission";

/** Billing banner above `_community` pages (spec: UI > Banner). Pure, client-safe. */

export type BannerTone = "info" | "warning" | "danger";
export type BannerAction = { kind: "portal" | "resume"; label: string };
export type Banner = {
	state: BillingState;
	tone: BannerTone;
	text: string;
	/** Owner only. */
	action: BannerAction | null;
};

export type BannerContext = {
	orgName: string;
	/** Owner copy only; never sent to admins / members. */
	price: string;
	ownerNames: readonly string[];
};

/** Trial days left at which the banner turns `warning` and members get a heads-up. */
export const BANNER_TRIAL_WARNING_DAYS = 3;

export function bannerFor(a: BillingAccess, role: string, ctx: BannerContext): Banner | null {
	return isOwnerRole(role) ? ownerBanner(a, ctx) : memberBanner(a, ctx);
}

function ownerBanner(a: BillingAccess, { price }: BannerContext): Banner | null {
	const b = (tone: BannerTone, text: string, action: BannerAction | null = null): Banner => ({
		state: a.state,
		tone,
		text,
		action,
	});
	switch (a.state) {
		case "trialing": {
			if (a.hasPaymentMethod) {
				const on = formatBillingDate(a.nextChargeAt ?? a.trialEndsAt);
				return b("info", `Trial · first charge ${price} on ${on}`);
			}
			const n = a.trialDaysLeft ?? 0;
			return b(
				n <= BANNER_TRIAL_WARNING_DAYS ? "warning" : "info",
				`${n} ${n === 1 ? "day" : "days"} left in trial · no charge unless you add payment details`,
				{ kind: "portal", label: "Add payment" }
			);
		}
		case "pending":
			return b("info", "Confirming your payment…");
		case "canceling":
			return b(
				"warning",
				a.accessEndsAt
					? `Subscription canceled · access until ${formatBillingDate(a.accessEndsAt)}`
					: "Subscription canceled · access until the end of the period",
				{ kind: "resume", label: "Resume" }
			);
		case "grace":
			return b(
				"danger",
				a.graceEndsAt
					? `Payment failed · update payment details before ${formatBillingDate(a.graceEndsAt)} to avoid a lock`
					: "Payment failed · update payment details to avoid a lock",
				{ kind: "portal", label: "Update payment" }
			);
		case "active":
		case "locked":
			return null;
	}
}

function memberBanner(a: BillingAccess, { orgName, ownerNames }: BannerContext): Banner | null {
	const owners = formatOwnerNames(ownerNames);
	if (
		a.state === "trialing" &&
		!a.hasPaymentMethod &&
		(a.trialDaysLeft ?? 0) <= BANNER_TRIAL_WARNING_DAYS
	) {
		return {
			state: a.state,
			tone: "warning",
			text: `${orgName}'s trial ends ${formatBillingDate(a.trialEndsAt)}. An owner (${owners}) needs to add payment details.`,
			action: null,
		};
	}
	if (a.state === "grace") {
		return {
			state: a.state,
			tone: "danger",
			text: `Billing for ${orgName} needs attention. Ask an owner (${owners}).`,
			action: null,
		};
	}
	return null;
}
