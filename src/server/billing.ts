import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db as defaultDb } from "@/db";
import { billingAccess } from "@/domain/billing";
import { AppError } from "@/domain/errors";
import { assertCan } from "@/domain/permission";
import {
	billingRow,
	ensureSubscription,
	loadBillingPage,
	returnUrl,
	setCancelAtPeriodEnd,
	startCheckout,
} from "@/lib/billing";
import { pullSubscriptionIntoRow } from "@/lib/billing-sync";
import { appUrl, createDodo } from "@/lib/dodo";
import { captureBillingEvent } from "@/lib/posthog-server";
import { orgMiddleware, orgMiddlewareAllowLocked } from "@/middleware/org";

/*
 * Billing server fns only. Logic lives in `@/lib/billing`: plain exports here would drag `@/db`
 * and `cloudflare:workers` into the client bundle (only `createServerFn` handlers are stripped).
 */

/** Owner-only Trial facts for the Trial started dialog; retries `ensureSubscription` if needed. */
export const getTrialSummaryFn = createServerFn({ method: "GET" })
	.middleware([orgMiddlewareAllowLocked])
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

/** Owner billing page data. */
export const getBillingFn = createServerFn({ method: "GET" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		return loadBillingPage(context.actor.organizationId);
	});

/**
 * Owner-only: a 24h Dodo customer portal link (add / update card). Client navigates to it and
 * comes back to `returnTo` (billing page by default, or `/locked`).
 */
export const openPortalFn = createServerFn({ method: "POST" })
	.middleware([orgMiddlewareAllowLocked])
	.validator(z.object({ returnTo: z.enum(["billing", "locked"]) }).optional())
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId, userId } = context.actor;
		const row = await billingRow(defaultDb, organizationId);
		if (!row?.dodoCustomerId) {
			throw new AppError("Conflict", "Billing is still being set up. Try again in a minute.");
		}
		const { link } = await createDodo().customers.customerPortal.create(row.dodoCustomerId, {
			return_url: returnUrl(appUrl(), data?.returnTo ?? "billing"),
		});
		captureBillingEvent("billing_checkout_opened", { userId, organizationId, kind: "portal" });
		return { url: link };
	});

/** Owner-only, ended sub: Dodo checkout URL to re-subscribe. Client navigates to it. */
export const startCheckoutFn = createServerFn({ method: "POST" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(async ({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId, userId } = context.actor;
		const url = await startCheckout(organizationId);
		captureBillingEvent("billing_checkout_opened", { userId, organizationId, kind: "checkout" });
		return { url };
	});

/** Owner-only: cancel at period end (not Lock-exempt: a Locked org has nothing to cancel). */
export const cancelSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.handler(({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		return setCancelAtPeriodEnd(context.actor.organizationId, true);
	});

/** Owner-only: undo a pending cancel. */
export const resumeSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		return setCancelAtPeriodEnd(context.actor.organizationId, false);
	});

/**
 * Owner, back from Dodo (`?from=dodo`): pull the current sub and overwrite the row, so the page
 * doesn't wait for the webhook. Returns the fresh access.
 */
export const syncBillingFn = createServerFn({ method: "POST" })
	.middleware([orgMiddlewareAllowLocked])
	.handler(async ({ context }) => {
		assertCan(context.actor, { billing: ["manage"] });
		const { organizationId } = context.actor;
		let row = await billingRow(defaultDb, organizationId);
		if (!row) throw new AppError("NotFound", "No billing for this organization");
		const now = new Date();
		if (row.subscriptionId) {
			row =
				(await pullSubscriptionIntoRow(defaultDb, createDodo(), {
					organizationId,
					subscriptionId: row.subscriptionId,
					now,
				})) ?? row;
		}
		return billingAccess(row, now);
	});
