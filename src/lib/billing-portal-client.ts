import { authClient } from "@/lib/auth-client";

/**
 * `@better-auth/stripe`'s client plugin exports no typed action for this endpoint
 * ($InferServerPlugin is `{}` — read off its dist, not its docs), so it's called through the raw
 * proxy fetch. `customerType: "organization"` routes it through `authorizeReference`
 * (owner-only, src/lib/auth.ts).
 */
export function openBillingPortal(returnUrl: string) {
	return authClient.$fetch<{ url: string; redirect: boolean }>("/subscription/billing-portal", {
		method: "POST",
		body: { returnUrl, customerType: "organization" },
	});
}
