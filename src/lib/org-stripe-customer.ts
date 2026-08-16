import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organization as organizationTable } from "@/db/schema";
import { stripe as stripeClient } from "@/lib/stripe";

/**
 * Shared by the best-effort `afterCreateOrganization` hook (src/lib/auth.ts) and
 * `ensureOrgStripeCustomer`'s lazy fallback (src/api/billing.ts) — one place creates the
 * Stripe customer and persists it, callers differ only in where they source email/name and
 * how they handle failure. No `externalId` uniqueness in Stripe, so idempotency key + org id
 * metadata guard against duplicate customers instead.
 */
export async function createOrgStripeCustomer(
	orgId: string,
	email: string,
	name: string
): Promise<string> {
	const customer = await stripeClient.customers.create(
		{ email, name, metadata: { organizationId: orgId } },
		{ idempotencyKey: `org-customer:${orgId}` }
	);

	await db
		.update(organizationTable)
		.set({ stripeCustomerId: customer.id })
		.where(eq(organizationTable.id, orgId));

	return customer.id;
}
