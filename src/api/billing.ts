import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import {
	organization as organizationTable,
	member as memberTable,
	subscription as subscriptionTable,
} from "@/db/schema";
import { stripe as stripeClient } from "@/lib/stripe";
import { getMember } from "@/lib/auth";
import { generatePrimaryKey } from "@/lib/generate";
import { buildCheckoutSessionParams } from "@/lib/checkout-session-params";
import { createOrgStripeCustomer } from "@/lib/org-stripe-customer";
import { authMiddleware } from "@/middleware/auth";

/** Blocking per PRD §7.1's duplicate guard table — everything else is safe to reuse. */
const BLOCKING_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

/** Lazy fallback for the best-effort `afterCreateOrganization` hook (ticket 12). */
async function ensureOrgStripeCustomer(orgId: string): Promise<string> {
	const org = await db.query.organization.findFirst({
		where: eq(organizationTable.id, orgId),
		columns: { id: true, name: true, stripeCustomerId: true },
	});

	if (!org) {
		throw new Error("Organization not found");
	}

	if (org.stripeCustomerId) {
		return org.stripeCustomerId;
	}

	const ownerMember = await db.query.member.findFirst({
		where: and(eq(memberTable.organizationId, orgId), eq(memberTable.role, "owner")),
		with: { user: { columns: { email: true } } },
	});

	if (!ownerMember?.user?.email) {
		throw new Error("Organization owner not found");
	}

	return createOrgStripeCustomer(orgId, ownerMember.user.email, org.name);
}

export const createCheckoutSession = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const orgId = context.session?.session?.activeOrganizationId;
		const userId = context.userId;

		if (typeof orgId !== "string" || typeof userId !== "string") {
			throw new Error("No current organization found");
		}

		// Never passes through the plugin's referenceMiddleware — carries its own owner-only guard.
		const member = await getMember(userId, orgId);
		if (member?.role !== "owner") {
			throw new Error("Only the organization owner can start checkout");
		}

		const customerId = await ensureOrgStripeCustomer(orgId);

		const existing = await db.query.subscription.findFirst({
			where: (fields, op) => op.eq(fields.referenceId, orgId),
		});

		if (existing?.status && BLOCKING_SUBSCRIPTION_STATUSES.has(existing.status)) {
			setResponseStatus(409);
			throw new Error("Organization already has a subscription in progress");
		}

		let subscriptionId: string;
		if (existing) {
			subscriptionId = existing.id;
		} else {
			subscriptionId = generatePrimaryKey();
			await db.insert(subscriptionTable).values({
				id: subscriptionId,
				plan: "org",
				referenceId: orgId,
				stripeCustomerId: customerId,
				status: "incomplete",
			});
		}

		const session = await stripeClient.checkout.sessions.create(
			buildCheckoutSessionParams({
				orgId,
				userId,
				subscriptionId,
				priceId: env.STRIPE_PRICE_ID,
				customerId,
				returnUrl: `${env.BETTER_AUTH_URL}/onboarding/checkout?confirming=1`,
			})
		);

		if (!session.client_secret) {
			throw new Error("Stripe did not return a checkout client secret");
		}

		return session.client_secret;
	});
