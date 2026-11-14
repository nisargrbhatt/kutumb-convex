import { eq } from "drizzle-orm";
import type DodoPayments from "dodopayments";
import type { CountryCode } from "dodopayments/resources/misc";
import { db as defaultDb } from "@/db";
import { orgBilling, organization, user } from "@/db/schema";
import { billingAccess, ownClockTrialEndsAt } from "@/domain/billing";
import type { CardSummary } from "@/domain/billingCopy";
import { AppError } from "@/domain/errors";
import type { QueryDb } from "@/domain/queries/db";
import { subscriptionEnded, subscriptionEventTarget } from "@/domain/billingEvents";
import { pullSubscriptionIntoRow } from "@/lib/billing-sync";
import { appUrl, createDodo, dodoProductId } from "@/lib/dodo";
import { captureBillingEvent } from "@/lib/posthog-server";
import { safeAsync } from "@/lib/safe";

export type BillingDeps = {
	db: QueryDb;
	dodo: Pick<
		DodoPayments,
		"customers" | "subscriptions" | "payments" | "invoices" | "checkoutSessions"
	>;
	productId: string;
	/** `BETTER_AUTH_URL`: base of Dodo return URLs. */
	appUrl: string;
	now: () => Date;
};

const withDefaults = (deps: Partial<BillingDeps>): BillingDeps => ({
	db: deps.db ?? defaultDb,
	dodo: deps.dodo ?? createDodo(),
	productId: deps.productId ?? dodoProductId(),
	appUrl: deps.appUrl ?? appUrl(),
	now: deps.now ?? (() => new Date()),
});

/** Where Dodo sends the owner back to; the page then runs `syncBillingFn` once. */
export const returnUrl = (base: string, to: "billing" | "locked") =>
	`${base}${to === "billing" ? "/settings/billing" : "/locked"}?from=dodo`;

export const billingRow = (db: QueryDb, organizationId: string) =>
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

			return pullSubscriptionIntoRow(db, dodo, { organizationId, subscriptionId, now: now() });
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
	captureBillingEvent("billing_trial_started", {
		userId: org.createdByUserId,
		organizationId: org.organizationId,
		subscribed,
	});
	return {
		subscribed,
		trialEndsAt: (subscribed && result.data?.trialEndsAt) || trialEndsAt,
	};
}

export type BillingInvoice = {
	paymentId: string;
	date: Date;
	/** Minor units incl. tax. */
	amount: number;
	currency: string;
	status: string;
	/** Dodo only issues an invoice for a succeeded payment. */
	hasPdf: boolean;
};

/** Best-effort Dodo read for the billing page: logs and yields `null` on failure. */
async function dodoRead<T>(what: string, organizationId: string, p: PromiseLike<T>) {
	const r = await safeAsync(Promise.resolve(p));
	if (r.success) return r.data;
	console.error(`billing page: ${what} failed`, organizationId, r.error);
	return null;
}

/**
 * Everything the owner billing page shows. Retries `ensureSubscription` for an org still without
 * a sub. Access comes from the row (never a live Dodo read); card, invoices and receipt email are
 * live Dodo reads that degrade to empty (`dodoUnavailable`) when Dodo is down.
 */
export async function loadBillingPage(organizationId: string, deps: Partial<BillingDeps> = {}) {
	const d = withDefaults(deps);
	let row = await billingRow(d.db, organizationId);
	if (!row) throw new AppError("NotFound", "No billing for this organization");
	if (row.needsSubscription) {
		const retried = await ensureSubscription(organizationId, d);
		if (retried.success && retried.data) row = retried.data;
	}
	const org = await d.db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
	});

	const customerId = row.dodoCustomerId;
	const [customer, methods, payments] = customerId
		? await Promise.all([
				dodoRead("customer", organizationId, d.dodo.customers.retrieve(customerId)),
				dodoRead(
					"payment methods",
					organizationId,
					d.dodo.customers.retrievePaymentMethods(customerId)
				),
				dodoRead(
					"payments",
					organizationId,
					d.dodo.payments.list({ customer_id: customerId, page_size: 50 })
				),
			])
		: [null, null, null];

	const card = methods?.items.find((m) => m.card)?.card;
	const paymentMethod: CardSummary | null = card
		? {
				network: card.card_network ?? null,
				last4: card.last4_digits ?? null,
				expMonth: card.expiry_month ?? null,
				expYear: card.expiry_year ?? null,
			}
		: null;
	const invoices: BillingInvoice[] = (payments?.items ?? []).map((p) => ({
		paymentId: p.payment_id,
		date: new Date(p.created_at),
		amount: p.total_amount,
		currency: p.currency,
		status: p.status ?? "processing",
		hasPdf: p.status === "succeeded",
	}));

	return {
		access: billingAccess(row, d.now()),
		orgName: org?.name ?? "",
		country: row.country,
		recurringPreTaxAmount: row.recurringPreTaxAmount,
		receiptEmail: customer?.email ?? null,
		paymentMethod,
		invoices,
		dodoUnavailable: !!customerId && (!customer || !methods || !payments),
	};
}

export type BillingPage = Awaited<ReturnType<typeof loadBillingPage>>;

/**
 * Cancel at period end (`cancel`) or undo it. Cancel only from trialing / active, resume only
 * from canceling. Pulls the sub right after, so the page doesn't wait for the webhook.
 */
export async function setCancelAtPeriodEnd(
	organizationId: string,
	cancel: boolean,
	deps: Partial<BillingDeps> = {}
) {
	const d = withDefaults(deps);
	const row = await billingRow(d.db, organizationId);
	if (!row) throw new AppError("NotFound", "No billing for this organization");
	const { state } = billingAccess(row, d.now());
	const allowed = cancel ? state === "trialing" || state === "active" : state === "canceling";
	if (!allowed || !row.subscriptionId) {
		throw new AppError(
			"Conflict",
			cancel ? "This subscription can't be canceled now." : "Nothing to resume."
		);
	}
	await d.dodo.subscriptions.update(row.subscriptionId, { cancel_at_next_billing_date: cancel });
	const pulled = await pullSubscriptionIntoRow(d.db, d.dodo, {
		organizationId,
		subscriptionId: row.subscriptionId,
		now: d.now(),
	});
	return billingAccess(pulled ?? row, d.now());
}

/**
 * Re-subscribe after the sub ended (`locked/canceled`): a new Dodo checkout, no Trial, no
 * coupons. The webhook adopts the new sub. Other states fix the existing sub in the portal.
 */
export async function startCheckout(organizationId: string, deps: Partial<BillingDeps> = {}) {
	const d = withDefaults(deps);
	const row = await billingRow(d.db, organizationId);
	if (!row?.dodoCustomerId) {
		throw new AppError("Conflict", "Billing is still being set up. Try again in a minute.");
	}
	if (billingAccess(row, d.now()).lockReason !== "canceled") {
		throw new AppError("Conflict", "Use the billing portal to update this subscription.");
	}
	const session = await d.dodo.checkoutSessions.create({
		product_cart: [{ product_id: d.productId, quantity: 1 }],
		customer: { customer_id: row.dodoCustomerId },
		subscription_data: { trial_period_days: 0 },
		metadata: { organizationId },
		return_url: returnUrl(d.appUrl, "locked"),
		feature_flags: { allow_discount_code: false },
	});
	if (!session.checkout_url) throw new Error("Dodo returned no checkout_url");
	return session.checkout_url;
}

/**
 * Owner back from Dodo (`?from=dodo`): pull the row's current sub so the page doesn't wait for the
 * webhook. If that sub has ended (re-subscribe checkout), find the customer's new sub at Dodo and
 * adopt it as the webhook would. Returns the fresh access.
 */
export async function syncBilling(organizationId: string, deps: Partial<BillingDeps> = {}) {
	const d = withDefaults(deps);
	let row = await billingRow(d.db, organizationId);
	if (!row) throw new AppError("NotFound", "No billing for this organization");
	const now = d.now();
	const pull = (subscriptionId: string) =>
		pullSubscriptionIntoRow(d.db, d.dodo, { organizationId, subscriptionId, now });
	if (row.subscriptionId) row = (await pull(row.subscriptionId)) ?? row;
	if (row.dodoCustomerId && subscriptionEnded(row, now)) {
		const ended = row;
		const { items } = await d.dodo.subscriptions.list({
			customer_id: ended.dodoCustomerId!,
			page_size: 10,
		});
		const [next] = items
			.filter(
				(s) =>
					subscriptionEventTarget(
						ended,
						{ subscriptionId: s.subscription_id, status: s.status },
						now
					) === "adopt"
			)
			.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
		if (next) {
			row = (await pull(next.subscription_id)) ?? row;
			if (ended.subscriptionId) {
				captureBillingEvent("billing_resubscribed", {
					organizationId,
					userId: ended.createdByUserId,
				});
			}
		}
	}
	return billingAccess(row, now);
}

/**
 * Invoice PDF of one of the org's payments, streamed from Dodo (keeps the API key server-side).
 * A payment of any other Dodo customer is `NotFound`.
 */
export async function invoicePdf(
	organizationId: string,
	paymentId: string,
	deps: Partial<BillingDeps> = {}
) {
	const d = withDefaults(deps);
	const row = await billingRow(d.db, organizationId);
	const customerId = row?.dodoCustomerId;
	const payment = customerId
		? await safeAsync(Promise.resolve(d.dodo.payments.retrieve(paymentId)))
		: null;
	if (!payment?.success || payment.data.customer.customer_id !== customerId) {
		throw new AppError("NotFound", "Invoice not found");
	}
	const pdf = await d.dodo.invoices.payments.retrieve(paymentId);
	return new Response(pdf.body, {
		headers: {
			"content-type": "application/pdf",
			"content-disposition": `inline; filename="invoice-${paymentId}.pdf"`,
			"cache-control": "private, no-store",
		},
	});
}
