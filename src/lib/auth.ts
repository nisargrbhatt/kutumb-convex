import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { polar as polarClient } from "@/lib/polar";
import { organization as organizationTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { safeAsync, safeSync } from "./safe";

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
			sendInvitationEmail: async (payload) => {
				const inviteLink = `${env.BETTER_AUTH_URL}/onboarding/invitations`;
				console.log("payload", payload, inviteLink);
				// [TODO]: Send Invitation Email
			},
			organizationHooks: {
				afterAddMember: async (payload) => {
					const parsedPayloadResult = safeSync(() => JSON.parse(payload.organization?.metadata));
					if (!parsedPayloadResult.success) {
						console.error("Payload parsing failed for", payload.organization.id);
						return;
					}

					const parsedPayload = parsedPayloadResult.data;
					const orgCustomerId = parsedPayload?.customerId;

					if (typeof orgCustomerId !== "string") {
						console.error("No Organization Customer Id found for", payload.organization.id);
					}

					const eventIngestResult = await safeAsync(
						polarClient.events.ingest({
							events: [
								{
									customerId: orgCustomerId,
									name: "user_added",
									metadata: {
										user_count: 1,
										organizationMemberId: payload.member.id,
										organizationId: payload.organization.id,
										userId: payload.user.id,
									},
									externalMemberId: payload.member.id,
									externalCustomerId: payload.organization.id,
								},
							],
						})
					);

					if (!eventIngestResult.success) {
						console.error(
							"Event Ingest failed for ",
							payload.organization.id,
							eventIngestResult.error
						);
					}
				},
				afterRemoveMember: async (payload) => {
					const parsedPayloadResult = safeSync(() => JSON.parse(payload.organization?.metadata));
					if (!parsedPayloadResult.success) {
						console.error("Payload parsing failed for", payload.organization.id);
						return;
					}

					const parsedPayload = parsedPayloadResult.data;
					const orgCustomerId = parsedPayload?.customerId;

					if (typeof orgCustomerId !== "string") {
						console.error("No Organization Customer Id found for", payload.organization.id);
					}

					const eventIngestResult = await safeAsync(
						polarClient.events.ingest({
							events: [
								{
									customerId: orgCustomerId,
									name: "user_removed",
									metadata: {
										user_count: -1,
										organizationMemberId: payload.member.id,
										organizationId: payload.organization.id,
										userId: payload.user.id,
									},
									externalMemberId: payload.member.id,
									externalCustomerId: payload.organization.id,
								},
							],
						})
					);

					if (!eventIngestResult.success) {
						console.error(
							"Event Ingest failed for ",
							payload.organization.id,
							eventIngestResult.error
						);
					}
				},
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
			disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
		},
	},
	databaseHooks: {
		session: {
			create: {
				before: async (session) => {
					const firstOrganization = await db.query.member.findFirst({
						where: (fields, operators) => operators.eq(fields.userId, session.userId),
						columns: {
							organizationId: true,
						},
					});

					return {
						data: {
							...session,
							activeOrganizationId: firstOrganization?.organizationId ?? null,
						},
					};
				},
			},
		},
	},
	baseURL: env.BETTER_AUTH_URL,
});
