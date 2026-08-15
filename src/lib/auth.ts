import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import { ac, member, owner, admin } from "./permission";
import { polar, checkout, portal, usage, webhooks } from "@polar-sh/better-auth";
import { stripe } from "@better-auth/stripe";
import { polar as polarClient } from "@/lib/polar";
import { stripe as stripeClient } from "@/lib/stripe";
import { organization as organizationTable, member as memberTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { safeAsync, safeSync } from "./safe";
import { resend } from "./resend";
import InviteEmail from "@/emails/InviteEmail";
import { EMAIL_CONFIG } from "./common";
import { ORGANIZATION_STATUS } from "@/db/constants";
import { getTrialDays, parseOrgMetadata } from "./org-status";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Look up a user's membership row in an org, for owner-only billing authorization checks. */
async function getMember(userId: string, organizationId: string) {
	return db.query.member.findFirst({
		where: and(eq(memberTable.userId, userId), eq(memberTable.organizationId, organizationId)),
	});
}

/** Merge a patch into an org's JSON metadata blob (never overwrites unrelated keys). */
async function mergeOrgMetadata(orgId: string, patch: Record<string, unknown>) {
	const org = await db.query.organization.findFirst({
		where: (fields, op) => op.eq(fields.id, orgId),
		columns: { metadata: true },
	});
	const merged = { ...parseOrgMetadata(org?.metadata), ...patch };
	await db
		.update(organizationTable)
		.set({ metadata: JSON.stringify(merged) })
		.where(eq(organizationTable.id, orgId));
}

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

				try {
					const { error } = await resend.emails.send({
						from: EMAIL_CONFIG.from,
						to: payload.email,
						subject: `You've been invited to join ${payload.organization.name}`,
						react: InviteEmail({
							organizationName: payload.organization.name,
							inviterName: payload.inviter?.user?.name,
							inviterEmail: payload.inviter?.user?.email,
							inviteLink: inviteLink,
							role: payload.role,
						}),
					});

					if (error) {
						console.error("Resend API correctly returned error:", error);
					}
				} catch (error) {
					console.error("Failed to send invitation email", error);
				}
			},
			organizationHooks: {
				// Stamp the trial on creation, server-side (authoritative clock).
				beforeCreateOrganization: async (payload) => {
					const trialEndsAt = Date.now() + getTrialDays() * DAY_MS;
					return {
						data: {
							...payload.organization,
							metadata: {
								...(payload.organization.metadata ?? {}),
								status: ORGANIZATION_STATUS.active,
								trialEndsAt,
							},
						},
					};
				},
				// Create the Polar customer up front so seat usage meters during the
				// trial. Best-effort + idempotent (externalId): never blocks creation.
				afterCreateOrganization: async (payload) => {
					const orgId = payload.organization.id;
					const customerResult = await safeAsync(
						polarClient.customers.create({
							email: payload.user.email,
							externalId: orgId,
							name: payload.organization.name,
						})
					);

					if (!customerResult.success) {
						console.error("Polar customer creation failed for", orgId, customerResult.error);
						return;
					}

					await mergeOrgMetadata(orgId, { customerId: customerResult.data.id });
				},
				afterRemoveMember: async (payload) => {
					console.log("afterRemoveMember hook called for", payload);
					const parsedPayloadResult = safeSync(() => JSON.parse(payload.organization?.metadata));
					if (!parsedPayloadResult.success) {
						console.error(
							"Payload parsing failed for",
							payload.organization.id,
							payload.organization?.metadata
						);
						throw new Error("Payload parsing failed");
					}

					const parsedPayload = parsedPayloadResult.data;
					const orgCustomerId = parsedPayload?.customerId;

					if (typeof orgCustomerId !== "string") {
						console.error("No Organization Customer Id found for", payload.organization.id);
						throw new Error("No Organization Customer Id found");
					}

					const eventIngestResult = await safeAsync(
						polarClient.events.ingest({
							events: [
								{
									customerId: orgCustomerId,
									name: "org_seat",
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
						throw new Error("Event Ingest failed");
					}
				},
				// Don't know why but afterAddMember hook is not working, so added afterAcceptInvitation hook which is working fine and is called after a user accepts an invitation
				// afterAddMember: async (payload) => {
				// 	console.log("afterAddMember hook called for", payload);
				// 	const parsedPayloadResult = safeSync(() => JSON.parse(payload.organization?.metadata));
				// 	if (!parsedPayloadResult.success) {
				// 		console.error(
				// 			"Payload parsing failed for",
				// 			payload.organization.id,
				// 			payload.organization?.metadata
				// 		);
				// 		throw new Error("Payload parsing failed");
				// 	}

				// 	const parsedPayload = parsedPayloadResult.data;
				// 	const orgCustomerId = parsedPayload?.customerId;

				// 	if (typeof orgCustomerId !== "string") {
				// 		console.error("No Organization Customer Id found for", payload.organization.id);
				// 		throw new Error("No Organization Customer Id found");
				// 	}

				// 	const eventIngestResult = await safeAsync(
				// 		polarClient.events.ingest({
				// 			events: [
				// 				{
				// 					customerId: orgCustomerId,
				// 					name: "org_seat",
				// 					metadata: {
				// 						user_count: 1,
				// 						organizationMemberId: payload.member.id,
				// 						organizationId: payload.organization.id,
				// 						userId: payload.user.id,
				// 					},
				// 					externalMemberId: payload.member.id,
				// 					externalCustomerId: payload.organization.id,
				// 				},
				// 			],
				// 		})
				// 	);

				// 	console.log("Event Ingest result for", payload.organization.id, eventIngestResult);

				// 	if (!eventIngestResult.success) {
				// 		console.error(
				// 			"Event Ingest failed for ",
				// 			payload.organization.id,
				// 			eventIngestResult.error
				// 		);
				// 		throw new Error("Event Ingest failed");
				// 	}
				// },
				afterAcceptInvitation: async (payload) => {
					console.log("afterAcceptInvitation hook called for", payload);
					const parsedPayloadResult = safeSync(() => JSON.parse(payload.organization?.metadata));
					if (!parsedPayloadResult.success) {
						console.error(
							"Payload parsing failed for",
							payload.organization.id,
							payload.organization?.metadata
						);
						throw new Error("Payload parsing failed");
					}

					const parsedPayload = parsedPayloadResult.data;
					const orgCustomerId = parsedPayload?.customerId;

					if (typeof orgCustomerId !== "string") {
						console.error("No Organization Customer Id found for", payload.organization.id);
						throw new Error("No Organization Customer Id found");
					}

					const eventIngestResult = await safeAsync(
						polarClient.events.ingest({
							events: [
								{
									customerId: orgCustomerId,
									name: "org_seat",
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

					console.log("Event Ingest result for", payload.organization.id, eventIngestResult);

					if (!eventIngestResult.success) {
						console.error(
							"Event Ingest failed for ",
							payload.organization.id,
							eventIngestResult.error
						);
						throw new Error("Event Ingest failed");
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
					// Subscription active -> paid. Clear trial, persist ids. Merge (keep customerId etc).
					onSubscriptionActive: async (payload) => {
						const organizationId = payload.data.metadata?.referenceId;
						if (typeof organizationId !== "string") {
							throw new Error("No Organization Id found");
						}

						await mergeOrgMetadata(organizationId, {
							status: ORGANIZATION_STATUS.active,
							trialEndsAt: null,
							subscriptionId: payload.data.id,
							customerId: payload.data.customerId,
						});
					},
					// Catch-all for status changes (past_due / unpaid -> pending, active -> active).
					onSubscriptionUpdated: async (payload) => {
						const organizationId = payload.data.metadata?.referenceId;
						if (typeof organizationId !== "string") {
							throw new Error("No Organization Id found");
						}

						const subStatus = payload.data.status;
						if (subStatus === "past_due" || subStatus === "unpaid") {
							await mergeOrgMetadata(organizationId, { status: ORGANIZATION_STATUS.pending });
						} else if (subStatus === "active") {
							await mergeOrgMetadata(organizationId, {
								status: ORGANIZATION_STATUS.active,
								trialEndsAt: null,
								subscriptionId: payload.data.id,
								customerId: payload.data.customerId,
							});
						}
					},
					// Access revoked (post-cancel / unpaid end) -> block, keep data.
					onSubscriptionRevoked: async (payload) => {
						const organizationId = payload.data.metadata?.referenceId;
						if (typeof organizationId !== "string") {
							throw new Error("No Organization Id found");
						}

						await mergeOrgMetadata(organizationId, { status: ORGANIZATION_STATUS.pending });
					},
					// Explicit cancellation -> hard-delete org (cascades all community data).
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
		stripe({
			stripeClient,
			stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
			createCustomerOnSignUp: false,
			subscription: {
				enabled: true,
				plans: [
					{
						name: "org",
						priceId: env.STRIPE_PRICE_ID,
					},
				],
				authorizeReference: async ({ user, referenceId }) =>
					(await getMember(user.id, referenceId))?.role === "owner",
			},
			organization: {
				enabled: true,
			},
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
	logger: {
		disabled: false,
		disableColors: false,
		level: "debug",
		log: (level, message, ...args) => {
			// Custom logging implementation
			console.log(`[${level}] ${message}`, ...args);
		},
	},
});
