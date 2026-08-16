import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { organization as organizationTable, subscription as subscriptionTable } from "@/db/schema";
import { generatePrimaryKey } from "@/lib/generate";
import { stripe as stripeClient } from "@/lib/stripe";
import { fromStripe, requireReferenceId } from "@/lib/subscription-from-stripe";

/**
 * Sole writer for every subscription lifecycle event. Re-retrieves the subscription so the
 * write always reflects Stripe's current state — a replayed or out-of-order event therefore
 * cannot write stale state (16-webhook-lifecycle.md). Upserts rather than blind-updating: the
 * row normally already exists (checkout pre-inserts it), but a subscription created outside our
 * checkout — e.g. by hand in the dashboard, for an org that already has a Stripe customer — has
 * no local row yet, and a bare UPDATE would silently drop the event.
 */
export async function syncSubscriptionFromStripe(stripeSubscriptionId: string): Promise<void> {
	const sub = await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
	const orgId = requireReferenceId(sub);
	const fields = fromStripe(sub);

	const existing = await db.query.subscription.findFirst({
		where: eq(subscriptionTable.referenceId, orgId),
		columns: { id: true },
	});

	if (existing) {
		await db.update(subscriptionTable).set(fields).where(eq(subscriptionTable.id, existing.id));
	} else {
		await db
			.insert(subscriptionTable)
			.values({ id: generatePrimaryKey(), referenceId: orgId, ...fields });
	}
}

/**
 * Unconditional, irreversible, silent — settled policy (16-webhook-lifecycle.md). Every child
 * of `organization.id` that's a real FK cascades and D1 enforces it
 * (04-org-delete-cascade-audit.md) — except `subscription.referenceId`, which predates that
 * audit (Polar era) and carries no FK, since the plugin's schema also uses it to reference
 * `user.id` for non-organization billing (unused here, but the column stays polymorphic). So
 * the subscription row needs an explicit delete; every other child is cascade-only. Not routed
 * through `auth.api.deleteOrganization` — the caller is Stripe, there is no session to authorize
 * with. Named seam for future external cleanup (Stripe customer deletion, asset purge).
 */
export async function deleteOrganizationCompletely(orgId: string): Promise<void> {
	await db.delete(subscriptionTable).where(eq(subscriptionTable.referenceId, orgId));
	await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
}

async function organizationExists(orgId: string): Promise<boolean> {
	const org = await db.query.organization.findFirst({
		where: eq(organizationTable.id, orgId),
		columns: { id: true },
	});

	return org != null;
}

/**
 * The `onEvent` guard (16-webhook-lifecycle.md §3): resolves the org this event belongs to, or
 * throws if that resolution itself is impossible (Stripe retries with backoff). If resolution
 * succeeds but the org no longer exists, that's terminal and expected after an unconditional
 * deletion — warn and return `null` so the caller no-ops instead of throwing (no retry storm).
 */
export async function resolveOrgIdOrGone(
	sub: Stripe.Subscription,
	eventType: string
): Promise<string | null> {
	const orgId = requireReferenceId(sub);

	if (await organizationExists(orgId)) {
		return orgId;
	}

	console.warn("stripe webhook: org gone", { orgId, event: eventType });
	return null;
}
