import { getBillingStatus } from "@/api/organization";
import { BILLING_STATUS } from "@/db/constants";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { RootLayout } from "@/components/RootLayout";
import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute("/_authed/onboarding/checkout/")({
	validateSearch: z.object({
		confirming: z.literal("1").optional(),
	}),
	beforeLoad: async ({ search }) => {
		const status = await getBillingStatus();
		if (status === BILLING_STATUS.pending) return;
		if (status === BILLING_STATUS.active && search.confirming) return;
		throw redirect({ to: BILLING_STATUS_ROUTE[status] });
	},
	component: RouteComponent,
});

// Stub — embedded Stripe checkout and the confirming poll land in a later slice.
function RouteComponent() {
	return (
		<RootLayout>
			<div className="flex w-full items-center justify-center p-6 md:p-10">
				<div className="w-full max-w-2xl">Checkout coming soon.</div>
			</div>
		</RootLayout>
	);
}
