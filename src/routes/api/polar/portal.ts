import { getFullUserContextCached } from "@/api/auth";
import { auth } from "@/lib/auth";
import { CustomerPortal } from "@polar-sh/tanstack-start";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

export const Route = createFileRoute("/api/polar/portal")({
	server: {
		handlers: {
			GET: CustomerPortal({
				accessToken: env.POLAR_ACCESS_TOKEN,
				getCustomerId: async (request: Request) => {
					const session = await auth.api.getSession({ headers: request.headers });

					const userId = session?.user?.id;

					if (!userId) {
						throw new Error("User not found");
					}

					const context = await getFullUserContextCached(userId);

					if (!context?.organization || context?.organization?.length < 1) {
						throw new Error("Organization not found");
					}

					const reqUrl = new URL(request.url);
					const orgId = reqUrl.searchParams.get("organizationId");

					const orgCustomerId = context?.organization?.find(
						(i) => i.id.toString() === orgId
					)?.customerId;

					if (!orgCustomerId) {
						throw new Error("Customer Id not found");
					}

					return orgCustomerId;
				}, // Function to resolve a Polar Customer ID
				returnUrl: new URL("/", env.BETTER_AUTH_URL).toString(), // An optional URL which renders a back-button in the Checkout
				server: env.POLAR_MODE === "sandbox" ? "sandbox" : "production", // Use sandbox if you're testing Polar - omit the parameter or pass 'production' otherwise
			}),
		},
	},
});
