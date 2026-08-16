import { checkoutPriceQuery } from "@/api/billing";
import { getBillingStatus } from "@/api/organization";
import { BILLING_STATUS } from "@/db/constants";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { authClient } from "@/lib/auth-client";
import { RootLayout } from "@/components/RootLayout";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { ClientOnly, createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";
import { EmbeddedCheckoutSection } from "./-components/EmbeddedCheckoutSection";
import { ConfirmingCheckout } from "./-components/ConfirmingCheckout";
import { Spinner } from "@/components/ui/spinner";

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

function PageHeader() {
	return (
		<Breadcrumb>
			<BreadcrumbList>
				<BreadcrumbItem>
					<BreadcrumbLink render={<Route.Link to="/dashboard" />}>Home</BreadcrumbLink>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbPage>Onboarding</BreadcrumbPage>
				</BreadcrumbItem>
				<BreadcrumbSeparator />
				<BreadcrumbItem>
					<BreadcrumbPage>Payment</BreadcrumbPage>
				</BreadcrumbItem>
			</BreadcrumbList>
		</Breadcrumb>
	);
}

function CheckoutCard() {
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: price } = useQuery(checkoutPriceQuery());

	return (
		<Card>
			<CardHeader>
				<CardTitle>Start your Kutumb subscription</CardTitle>
				<CardDescription>
					{price ?? "…"} / month for {activeOrg?.name}. Cancel any time from billing settings.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ClientOnly
					fallback={
						<div className="flex items-center justify-center gap-2 rounded-md border p-10 text-sm text-muted-foreground">
							<Spinner />
							Loading checkout…
						</div>
					}
				>
					<EmbeddedCheckoutSection />
				</ClientOnly>
			</CardContent>
		</Card>
	);
}

function RouteComponent() {
	const { confirming } = Route.useSearch();

	return (
		<RootLayout>
			<div className="flex w-full flex-col items-center gap-4 p-6 md:p-10">
				<div className="flex w-full max-w-2xl flex-col gap-4">
					<PageHeader />
					{confirming ? <ConfirmingCheckout /> : <CheckoutCard />}
				</div>
			</div>
		</RootLayout>
	);
}
