import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { getBillingStatus } from "@/api/organization";
import { BILLING_STATUS } from "@/db/constants";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/_community")({
	beforeLoad: async () => {
		const status = await getBillingStatus();
		if (status !== BILLING_STATUS.active) {
			throw redirect({ to: BILLING_STATUS_ROUTE[status] });
		}
	},
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	return (
		<CommunityLayout>
			<Outlet />
		</CommunityLayout>
	);
}
