import { checkCurrentOrgPaymentSetupQuery } from "@/api/organization";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { safeAsync } from "@/lib/safe";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import z from "zod";

export const Route = createFileRoute("/_authed/onboarding/success")({
	component: RouteComponent,
	validateSearch: z.object({
		checkout_id: z.string(),
	}),
	beforeLoad: async ({ context }) => {
		await safeAsync(context.queryClient.ensureQueryData(checkCurrentOrgPaymentSetupQuery()));
	},
});

function RouteComponent() {
	const { checkout_id } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: paymentSetupData, refetch } = useQuery(checkCurrentOrgPaymentSetupQuery());

	useEffect(() => {
		if (paymentSetupData?.paymentSetup === true) {
			toast.success("Payment done successfully", {
				description: "Redirecting you to your Organization's dashboard",
			});
			navigate({
				to: "/dashboard",
			});
		}
	}, [paymentSetupData]);

	return (
		<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
			<div className="w-full max-w-sm">
				<div className={cn("flex flex-col gap-6")}>
					<Card>
						<CardHeader>
							<CardTitle>Organization payment</CardTitle>
							<CardDescription>
								Payment done successfully for <span aria-label="Checkout ID">{checkout_id}</span>
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Item variant="outline">
								<ItemMedia variant="default">
									<Spinner />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>Server Confirmation</ItemTitle>
									<ItemDescription>
										Waiting for server to confirm the payment and create organization assets
									</ItemDescription>
								</ItemContent>
							</Item>
						</CardContent>
						<CardFooter>
							<Button
								type="button"
								variant={"outline"}
								onClick={() => {
									refetch();
								}}
							>
								<Loader2 /> Recheck
							</Button>
						</CardFooter>
					</Card>
				</div>
			</div>
		</div>
	);
}
