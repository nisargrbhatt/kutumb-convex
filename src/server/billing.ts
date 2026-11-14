import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import type DodoPayments from "dodopayments";
import type { CountryCode } from "dodopayments/resources/misc";
import { db as defaultDb } from "@/db";
import { orgBilling, organization, user } from "@/db/schema";
import { ownClockTrialEndsAt } from "@/domain/billing";
import { AppError } from "@/domain/errors";
import { assertCan } from "@/domain/permission";
import type { QueryDb } from "@/domain/queries/db";
import { pullSubscriptionIntoRow } from "@/lib/billing-sync";
import { createDodo, dodoProductId } from "@/lib/dodo";
import { captureBillingCheckoutOpened, captureBillingTrialStarted } from "@/lib/posthog-server";
import { safeAsync } from "@/lib/safe";
import { orgMiddleware } from "@/middleware/org";

export type BillingDeps = {
	db: QueryDb;
	dodo: Pick<DodoPayments, "customers" | "subscriptions">;
	productId: string;
	now: () => Date;
};

const withDefaults = (deps: Partial<BillingDeps>): BillingDeps => ({
	db: deps.db ?? defaultDb,
	dodo: deps.dodo ?? createDodo(),
	productId: deps.productId ?? dodoProductId(),
	now: deps.now ?? (() => new Date()),
});

const billingRow = (db: QueryDb, organizationId: string) =>
	db.query.orgBilling.findFirst({ where: eq(orgBilling.organizationId, organizationId) });

/**
 * Idempotent: give the org its Dodo customer + card-less Trial sub, doing only the missing step
 * (never a second customer or sub), then pull the sub into `orgBilling`. Each id is saved as soon as
 * Dodo returns it, so a failure part-way resumes on the next call. Never throws: Dodo failure is
 * logged and the org keeps trialing from its own `trialEndsAt` (ADR 0013).
 */
export async function ensureSubscription(organizationId: string, deps: Partial<BillingDeps> = {}) {
	const result = await safeAsync(
		(async () => {
			const { db, dodo, productId, now } = withDefaults(deps);
			const row = await billingRow(db, organizationId);
			if (!row) throw new Error(`orgBilling row missing for ${organizationId}`);
			if (!row.needsSubscription) return row;

			const save = (set: Partial<typeof orgBilling.$inferInsert>) =>
				db.update(orgBilling).set(set).where(eq(orgBilling.organizationId, organizationId));

			let customerId = row.dodoCustomerId;
			if (!customerId) {
				const [org, creator] = await Promise.all([
					db.query.organization.findFirst({ where: eq(organization.id, organizationId) }),
					db.query.user.findFirst({ where: eq(user.id, row.createdByUserId) }),
				]);
				if (!org || !creator) throw new Error(`org or creator missing for ${organizationId}`);
				({ customer_id: customerId } = await dodo.customers.create({
					name: org.name,
					email: creator.email,
					metadata: { organizationId },
				}));
				await save({ dodoCustomerId: customerId });
			}

			let subscriptionId = row.subscriptionId;
			if (!subscriptionId) {
				// Deprecated in the SDK but the only card-less Trial start (ADR 0013). Country alone
				// is accepted (Test Mode probe 2026-11-14).
				({ subscription_id: subscriptionId } = await dodo.subscriptions.create({
					customer: { customer_id: customerId },
					product_id: productId,
					quantity: 1,
					billing: { country: row.country as CountryCode },
					payment_link: false,
					metadata: { organizationId },
				}));
				await save({ subscriptionId });
			}

			return pullSubscriptionIntoRow({ db, dodo, organizationId, subscriptionId, now });
		})()
	);
	if (!result.success) console.error("ensureSubscription failed", organizationId, result.error);
	return result;
}

/**
 * Right after org create: insert its `orgBilling` row (own-clock Trial), then try to start the Dodo
 * Trial. Dodo failure leaves `needsSubscription` for the retries (billing page, dashboard, sweep).
 */
export async function startOrgBilling(
	org: { organizationId: string; createdByUserId: string; country: string; createdAt: Date },
	deps: Partial<BillingDeps> = {}
) {
	const db = deps.db ?? defaultDb;
	const now = deps.now ?? (() => new Date());
	const trialEndsAt = ownClockTrialEndsAt(org.createdAt);
	await db.insert(orgBilling).values({
		organizationId: org.organizationId,
		createdByUserId: org.createdByUserId,
		country: org.country,
		trialEndsAt,
		needsSubscription: true,
		syncedAt: now(),
	});
	const result = await ensureSubscription(org.organizationId, deps);
	const subscribed = result.success;
	captureBillingTrialStarted({
		createdByUserId: org.createdByUserId,
		organizationId: org.organizationId,
		subscribed,
	});
	return {
		subscribed,
		trialEndsAt: (subscribed && result.data?.trialEndsAt) || trialEndsAt,
	};
}

/** Owner-only Trial facts for the Trial started dialog; retries `ensureSubscription` if needed. */
export const getTrialSummaryFn = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId } = context.actor;
		let row = await billingRow(defaultDb, organizationId);
		if (!row) throw new AppError("NotFound", "Billing not found");
		if (row.needsSubscription) {
			const retried = await ensureSubscription(organizationId);
			if (retried.success && retried.data) row = retried.data;
		}
		return { trialEndsAt: row.trialEndsAt, hasPaymentMethod: row.hasPaymentMethod };
	});

/** Owner-only: a 24h Dodo customer portal link (add / update card). Client navigates to it. */
export const openPortalFn = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId, userId } = context.actor;
		const row = await billingRow(defaultDb, organizationId);
		if (!row?.dodoCustomerId) {
			throw new AppError("Conflict", "Billing is still being set up. Try again in a minute.");
		}
		const { link } = await createDodo().customers.customerPortal.create(row.dodoCustomerId, {
			return_url: `${env.BETTER_AUTH_URL}/settings/billing?from=dodo`,
		});
		captureBillingCheckoutOpened({ userId, organizationId, kind: "portal" });
		return { url: link };
	});
