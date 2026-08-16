import { db } from "@/db";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "cloudflare:workers";
import type Stripe from "stripe";
import { ac, member, owner, admin } from "./permission";
import { stripe } from "@better-auth/stripe";
import { stripe as stripeClient } from "@/lib/stripe";
import { member as memberTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createOrgStripeCustomer } from "@/lib/org-stripe-customer";
import {
	deleteOrganizationCompletely,
	resolveOrgIdOrGone,
	syncSubscriptionFromStripe,
} from "@/lib/billing-webhook";
import { safeAsync } from "./safe";
import { resend } from "./resend";
import InviteEmail from "@/emails/InviteEmail";
import { EMAIL_CONFIG } from "./common";

/**
 * Guards live here, not inside the plugin's built-in handlers — those wrap everything in
 * try/catch and swallow, so a guard placed there can never surface as a non-2xx. This runs
 * after each built-in handler, and is the only handler for the pending_update and
 * paused/resumed events (the plugin has no built-in for those), so its throws propagate to the
 * plugin's outer catch (400, Stripe retries). `checkout.session.completed` needs no case: the
 * plugin's own built-in handler already re-retrieves and writes current truth. No invoice
 * events — a failed charge already surfaces as `customer.subscription.updated`
 * (16-webhook-lifecycle.md).
 */
async function onStripeEvent(event: Stripe.Event) {
	switch (event.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.paused":
		case "customer.subscription.resumed":
		case "customer.subscription.pending_update_applied":
		case "customer.subscription.pending_update_expired": {
			const sub = event.data.object as Stripe.Subscription;
			const orgId = await resolveOrgIdOrGone(sub, event.type);
			if (orgId) {
				await syncSubscriptionFromStripe(sub.id);
			}
			return;
		}
		case "customer.subscription.deleted": {
			const sub = event.data.object as Stripe.Subscription;
			const orgId = await resolveOrgIdOrGone(sub, event.type);
			if (orgId) {
				await deleteOrganizationCompletely(orgId);
			}
			return;
		}
		default:
			return;
	}
}

/** Look up a user's membership row in an org, for owner-only billing authorization checks. */
export async function getMember(userId: string, organizationId: string) {
	return db.query.member.findFirst({
		where: and(eq(memberTable.userId, userId), eq(memberTable.organizationId, organizationId)),
	});
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
				// Best-effort; never blocks org creation. No externalId uniqueness in
				// Stripe — idempotency key + metadata.organizationId guard instead.
				afterCreateOrganization: async (payload) => {
					const orgId = payload.organization.id;
					const customerResult = await safeAsync(
						createOrgStripeCustomer(orgId, payload.user.email, payload.organization.name)
					);

					if (!customerResult.success) {
						console.error("Stripe customer creation failed for", orgId, customerResult.error);
					}
				},
			},
		}),
		stripe({
			stripeClient,
			stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
			createCustomerOnSignUp: false,
			onEvent: onStripeEvent,
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
