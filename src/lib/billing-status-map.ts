import { BILLING_STATUS } from "@/db/constants";
import type { BillingStatus } from "./billing-status";

export function mapSubscriptionStatus(status: string | null | undefined): BillingStatus {
	switch (status) {
		case "active":
		case "trialing":
			return BILLING_STATUS.active;
		case "past_due":
		case "unpaid":
			return BILLING_STATUS.past_due;
		default:
			return BILLING_STATUS.pending;
	}
}

export const BILLING_STATUS_ROUTE = {
	active: "/dashboard",
	pending: "/onboarding/checkout",
	past_due: "/payment-required",
} as const satisfies Record<BillingStatus, string>;
