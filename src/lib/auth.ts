import { db } from "@/db";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { polar as polarClient } from "@/lib/polar";
import { organization as organizationTable } from "@/db/schema";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "sqlite",
	}),
	plugins: [
		tanstackStartCookies(),
		organization({
			ac: ac,
			roles: {
				owner: owner,
				admin: admin,
				member: member,
			},
		}),
		polar({
			client: polarClient,
			createCustomerOnSignUp: false,
			use: [
				checkout({
					products: [
						{
							productId: env.POLAR_PRODUCT_ID, // ID of Product from Polar Dashboard
							slug: "org-product", // Custom slug for easy reference in Checkout URL, e.g. /checkout/pro
						},
					],
					successUrl: "/onboarding/success?checkout_id={CHECKOUT_ID}",
					authenticatedUsersOnly: true,
					returnUrl: "/onboarding/create",
				}),
				portal(),
				usage(),
				webhooks({
					secret: env.POLAR_WEBHOOK_SECRET,
					onSubscriptionCreated: async (payload) => {
						const organizationId = payload.data.metadata?.referenceId;
						if (typeof organizationId !== "string") {
							throw new Error("No Organization Id found");
						}

						const result = await db
							.update(organizationTable)
							.set({
								metadata: JSON.stringify({
									subscriptionId: payload.data.id,
									customerId: payload.data.customerId,
									paymentSetup: true,
								}),
							})
							.where(eq(organizationTable.id, organizationId));

						if (!result.success) {
							console.error(result.error);
							throw new Error("Failed to update organization metadata");
						}
					},
					onSubscriptionCanceled: async (payload) => {
						const organizationId = payload.data.metadata?.referenceId;
						if (typeof organizationId !== "string") {
							throw new Error("No Organization Id found");
						}

						const result = await db
							.delete(organizationTable)
							.where(eq(organizationTable.id, organizationId));

						if (!result.success) {
							console.error(result.error);
							throw new Error("Failed to delete organization");
						}
					},
				}),
			],
		}),
	],
	emailAndPassword: {
		enabled: false,
	},
	secret: env.BETTER_AUTH_SECRET,
	socialProviders: {
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	baseURL: env.BETTER_AUTH_URL,
});
