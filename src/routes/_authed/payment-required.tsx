import { getBillingStatus } from "@/api/organization";
import { RootLayout } from "@/components/RootLayout";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { BILLING_STATUS } from "@/db/constants";
import { authClient } from "@/lib/auth-client";
import { openBillingPortal } from "@/lib/billing-portal-client";
import { BILLING_STATUS_ROUTE } from "@/lib/billing-status-map";
import { usePostHog } from "@posthog/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/payment-required")({
	beforeLoad: async () => {
		const status = await getBillingStatus();
		if (status !== BILLING_STATUS.past_due) {
			throw redirect({ to: BILLING_STATUS_ROUTE[status] });
		}
	},
	component: PaymentRequiredPage,
});

function PaymentRequiredPage() {
	const posthog = usePostHog();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: organizations } = authClient.useListOrganizations();

	const handleManageBilling = async () => {
		posthog.capture("billing_portal_opened", { source: "payment_required" });
		const { error } = await openBillingPortal("/payment-required");
		if (error) {
			toast.error("Failed to open billing portal", { description: "Please try again later." });
		}
	};

	return (
		<RootLayout>
			<div className="flex w-full items-center justify-center p-6 md:p-10">
				<div className="w-full max-w-sm">
					<Card>
						<CardHeader>
							<CardTitle>Payment failed</CardTitle>
							<CardDescription>
								We couldn't collect this month's payment for {activeOrg?.name}. Update your payment
								method to restore access.
							</CardDescription>
						</CardHeader>
						<CardFooter className="flex flex-col gap-2 sm:flex-row sm:items-center">
							<Button
								type="button"
								onClick={handleManageBilling}
								variant="outline"
								className="w-full sm:w-auto"
							>
								Manage billing <ArrowUpRight />
							</Button>
							{organizations && organizations.length > 0 ? (
								<Select
									items={Object.fromEntries(organizations.map((org) => [org.id, org.name]))}
									onValueChange={async (value) => {
										if (!value) return;
										await authClient.organization.setActive({
											organizationId: value,
										});
										window.location.reload();
									}}
									defaultValue={activeOrg?.id}
								>
									<SelectTrigger className="w-full sm:w-40">
										<SelectValue
											title={"Organization Switcher"}
											placeholder="Select an organization"
										/>
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectLabel>Organizations</SelectLabel>
											{organizations.map((org) => (
												<SelectItem key={org.id} value={org.id}>
													{org.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							) : null}
						</CardFooter>
					</Card>
				</div>
			</div>
		</RootLayout>
	);
}
