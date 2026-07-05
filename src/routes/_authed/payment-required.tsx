import { getOrgStatus } from "@/api/organization";
import { ORGANIZATION_STATUS } from "@/db/constants";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PaymentRequiredBanner } from "./-components/PaymentRequiredBanner";

export const Route = createFileRoute("/_authed/payment-required")({
	beforeLoad: async () => {
		const orgStatus = await getOrgStatus();
		if (orgStatus.status === ORGANIZATION_STATUS.active) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PaymentRequiredBanner,
});
