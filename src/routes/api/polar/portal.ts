import { db } from "@/db";
import { auth } from "@/lib/auth";
import { safeSync } from "@/lib/safe";
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

					const activeOrganizationId = session?.session?.activeOrganizationId;

					if (!activeOrganizationId) {
						throw new Error("Organization not found");
					}

					const organization = await db.query.organization.findFirst({
						where(fields, operators) {
							return operators.eq(fields.id, activeOrganizationId);
						},
					});

					const parsedPayloadResult = safeSync(() => JSON.parse(organization?.metadata ?? "{}"));
					if (!parsedPayloadResult.success) {
						console.error("Payload parsing failed for", organization?.id);
						throw new Error("Payload parsing failed");
					}

					const parsedPayload = parsedPayloadResult.data;
					const orgCustomerId = parsedPayload?.customerId;

					if (typeof orgCustomerId !== "string") {
						console.error("No Organization Customer Id found for", organization?.id);
						throw new Error("No Organization Customer Id found");
					}

					return orgCustomerId;
				}, // Function to resolve a Polar Customer ID
				returnUrl: new URL("/", env.BETTER_AUTH_URL).toString(), // An optional URL which renders a back-button in the Checkout
				server: env.POLAR_MODE === "sandbox" ? "sandbox" : "production", // Use sandbox if you're testing Polar - omit the parameter or pass 'production' otherwise
			}),
		},
	},
});
