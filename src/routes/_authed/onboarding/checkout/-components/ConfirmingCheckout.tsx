import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { billingStatusQuery } from "@/api/organization";
import { BILLING_STATUS } from "@/db/constants";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

/**
 * Polls the same DB read the gate uses — never Stripe's session.retrieve (rejected in ticket 15:
 * it would either lie, or make this page a second writer alongside the webhook). No timeout cap;
 * refetchInterval (billingStatusQuery) stops on its own once status flips to active.
 */
export function ConfirmingCheckout() {
	const router = useRouter();
	const posthog = usePostHog();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const { data: status, refetch, isFetching } = useQuery(billingStatusQuery());
	const hasCapturedRef = useRef(false);

	useEffect(() => {
		if (status !== BILLING_STATUS.active || hasCapturedRef.current) return;
		hasCapturedRef.current = true;

		posthog.capture("payment_completed", { organization_id: activeOrg?.id });
		toast.success("Payment received", {
			description: activeOrg?.name ? `${activeOrg.name} is ready to go.` : undefined,
		});
		router.navigate({ to: "/dashboard" });
	}, [status, activeOrg, posthog, router]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment received</CardTitle>
				<CardDescription>Setting up {activeOrg?.name}.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-3 rounded-md border p-4">
					<Spinner className="size-5 shrink-0" />
					<div className="text-sm">
						<p className="font-medium">Confirming with our server</p>
						<p className="text-muted-foreground">This usually takes a few seconds.</p>
					</div>
				</div>
			</CardContent>
			<CardFooter>
				<Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
					<RefreshCw className={isFetching ? "animate-spin" : undefined} />
					Recheck
				</Button>
			</CardFooter>
		</Card>
	);
}
