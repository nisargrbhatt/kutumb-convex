import { eq } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { billingWebhookEvent, orgBilling } from "@/db/schema";
import type { DodoSubscriptionStatus } from "@/db/constants";
import { billingAccess } from "@/domain/billing";
import {
	diffBillingAccess,
	subscriptionEventTarget,
	type BillingAnalyticsEvent,
} from "@/domain/billingEvents";
import { pullSubscriptionIntoRow, type DodoSubscriptions } from "@/lib/billing-sync";

type Db = BaseSQLiteDatabase<"async", any, any>;

export type BillingWebhookDeps = {
	db: Db;
	dodo: DodoSubscriptions & {
		webhooks: {
			unwrap(body: string, opts: { headers: Record<string, string> }): unknown;
			unsafeUnwrap(body: string): unknown;
		};
	};
	/** Dev only (`dodoWebhookUnsafe`): skip signature verification. */
	unsafe?: boolean;
	capture: (event: BillingAnalyticsEvent, p: { organizationId: string; userId: string }) => void;
	/** Grace-start email to all owners (spec: Reminders); best effort, never fails the webhook. */
	notifyGraceStart: (row: typeof orgBilling.$inferSelect) => Promise<unknown>;
	now?: () => Date;
};

/** The fields we read off `subscription.*` (a Subscription) and `payment.*` (a Payment) payloads. */
type Payload = {
	subscription_id?: string | null;
	status?: DodoSubscriptionStatus;
	past_due_ends_at?: string | null;
	customer?: { customer_id?: string };
	metadata?: Record<string, string>;
};

const ok = () => new Response(null, { status: 200 });

/**
 * Dodo webhook (spec: Webhook). Verify → dedupe on `webhook-id` → resolve org → adopt-or-ignore →
 * pull the sub from Dodo and overwrite the row → report access changes. A failed Dodo pull is a
 * 500 with the dedupe row removed, so Dodo's retry is processed.
 */
export async function handleBillingWebhook(
	request: Request,
	deps: BillingWebhookDeps
): Promise<Response> {
	const { db } = deps;
	const body = await request.text();
	let event: { type: string; data: Payload };
	try {
		event = (
			deps.unsafe
				? deps.dodo.webhooks.unsafeUnwrap(body)
				: deps.dodo.webhooks.unwrap(body, { headers: Object.fromEntries(request.headers) })
		) as typeof event;
	} catch {
		return new Response("invalid signature", { status: 401 });
	}

	const webhookId = request.headers.get("webhook-id") ?? "";
	const now = deps.now?.() ?? new Date();
	const inserted = await db
		.insert(billingWebhookEvent)
		.values({ webhookId, type: event.type, receivedAt: now })
		.onConflictDoNothing()
		.returning({ webhookId: billingWebhookEvent.webhookId });
	if (inserted.length === 0) return ok();

	try {
		await handleEvent(event, deps, now);
		return ok();
	} catch (error) {
		console.error("billing webhook failed", event.type, error);
		await db.delete(billingWebhookEvent).where(eq(billingWebhookEvent.webhookId, webhookId));
		return new Response("sync failed", { status: 500 });
	}
}

async function handleEvent(
	event: { type: string; data: Payload },
	deps: BillingWebhookDeps,
	now: Date
) {
	const isSub = event.type.startsWith("subscription.");
	if (!isSub && !event.type.startsWith("payment.")) return;
	const { data } = event;
	const subscriptionId = data.subscription_id;
	if (!subscriptionId) return;

	const row = await findRow(deps.db, data);
	if (!row) return;

	const target = subscriptionEventTarget(
		row,
		{ subscriptionId, ...(isSub && data.status && { status: data.status }) },
		now
	);
	if (target === "ignore") return;

	const after = await pullSubscriptionIntoRow(deps.db, deps.dodo, {
		organizationId: row.organizationId,
		subscriptionId,
		...(isSub && data.past_due_ends_at && { pastDueEndsAt: new Date(data.past_due_ends_at) }),
		now,
	});
	if (!after) return;

	const events = diffBillingAccess(billingAccess(row, now), billingAccess(after, now));
	const who = { organizationId: row.organizationId, userId: row.createdByUserId };
	if (target === "adopt" && row.subscriptionId) deps.capture("billing_resubscribed", who);
	for (const e of events) {
		if (e !== "grace_started") deps.capture(`billing_${e}`, who);
	}
	if (events.includes("grace_started")) {
		await deps
			.notifyGraceStart(after)
			.catch((error) => console.error("grace-start email failed", row.organizationId, error));
	}
}

/** Org by `metadata.organizationId`, else by Dodo customer id. */
async function findRow(db: Db, data: Payload) {
	const orgId = data.metadata?.organizationId;
	if (orgId) {
		const [row] = await db.select().from(orgBilling).where(eq(orgBilling.organizationId, orgId));
		if (row) return row;
	}
	const customerId = data.customer?.customer_id;
	if (!customerId) return null;
	const [row] = await db.select().from(orgBilling).where(eq(orgBilling.dodoCustomerId, customerId));
	return row ?? null;
}
