import { useCallback, useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useRouter } from "@tanstack/react-router";
import { usePostHog } from "@posthog/react";
import { createCheckoutSession } from "@/api/billing";
import { DUPLICATE_SUBSCRIPTION_ERROR_MESSAGE } from "@/lib/checkout-session-params";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

// Module scope per Stripe's guidance (ticket 02).
const stripePromise = loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY);

type SessionState =
	| { status: "loading" }
	| { status: "ready"; clientSecret: string }
	| { status: "error" };

/**
 * Mounted inside ClientOnly by the route. The server call happens exactly once, in `startCheckout`
 * — `fetchClientSecret` below just hands the already-fetched secret to the provider, so it stays
 * referentially stable after the provider mounts (react-stripe-js warns otherwise).
 */
export function EmbeddedCheckoutSection() {
	const router = useRouter();
	const posthog = usePostHog();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const [session, setSession] = useState<SessionState>({ status: "loading" });

	const startCheckout = useCallback(async () => {
		setSession({ status: "loading" });
		try {
			const clientSecret = await createCheckoutSession();
			posthog.capture("checkout_started", { organization_id: activeOrg?.id });
			setSession({ status: "ready", clientSecret });
		} catch (error) {
			if (error instanceof Error && error.message === DUPLICATE_SUBSCRIPTION_ERROR_MESSAGE) {
				// The org is already paid — refetch the gate's billing status instead of retrying.
				await router.invalidate();
				return;
			}
			setSession({ status: "error" });
		}
	}, [posthog, router, activeOrg?.id]);

	useEffect(() => {
		startCheckout();
	}, [startCheckout]);

	const fetchClientSecret = useCallback(
		() =>
			session.status === "ready"
				? Promise.resolve(session.clientSecret)
				: Promise.reject(new Error("Checkout session is not ready")),
		[session]
	);

	if (session.status === "loading") {
		return (
			<div className="flex items-center justify-center gap-2 rounded-md border p-10 text-sm text-muted-foreground">
				<Spinner />
				Starting checkout…
			</div>
		);
	}

	if (session.status === "error") {
		return (
			<div className="flex flex-col items-center gap-4 rounded-md border p-10 text-center">
				<p className="text-sm text-muted-foreground">We couldn't start checkout.</p>
				<Button type="button" variant="outline" onClick={startCheckout}>
					Try again
				</Button>
			</div>
		);
	}

	return (
		<EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
			<EmbeddedCheckout className="w-full" />
		</EmbeddedCheckoutProvider>
	);
}
