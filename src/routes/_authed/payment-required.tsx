import { getBillingStatus } from "@/api/organization";
import { BILLING_STATUS } from "@/db/constants";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PaymentRequiredBanner } from "./-components/PaymentRequiredBanner";

export const Route = createFileRoute("/_authed/payment-required")({
	beforeLoad: async () => {
		const status = await getBillingStatus();
		if (status !== BILLING_STATUS.past_due) {
			throw redirect({ to: BILLING_STATUS_ROUTE[status] });
		}
	},
	component: PaymentRequiredBanner,
});
