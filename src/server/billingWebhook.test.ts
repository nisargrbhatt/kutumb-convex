import { eq } from "drizzle-orm";
import DodoPayments from "dodopayments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { Webhook } from "standardwebhooks";
import { beforeEach, describe, expect, it } from "vitest";
import { orgBilling } from "@/db/schema";
import { freshDb } from "@/test/sqliteDb";
import { handleBillingWebhook, type BillingWebhookDeps } from "./billingWebhook";

const SECRET = `whsec_${Buffer.from("test-webhook-secret-32-bytes!!!!").toString("base64")}`;
const DAY = 86_400_000;
const NOW = new Date("2026-11-20T00:00:00.000Z");
const CREATED = "2026-11-14T00:00:00.000Z";
const TRIAL_ENDS = "2026-11-29T00:00:00.000Z";

/** A Dodo Subscription as `subscriptions.retrieve` / webhook payloads carry it (fields we read). */
const sub = (over: Partial<Subscription> & { subscription_id: string }) =>
	({
		status: "active",
		created_at: CREATED,
		trial_period_days: 15,
		next_billing_date: TRIAL_ENDS,
		cancel_at_next_billing_date: false,
		has_payment_method: false,
		recurring_pre_tax_amount: 500,
		customer: { customer_id: "cus_1", email: "o@x.test", name: "Org 1" },
		metadata: { organizationId: "o1" },
		...over,
	}) as Subscription;

let n = 0;
/** Signs `event` the way Dodo does (Standard Webhooks) and builds the POST. */
function signed(event: { type: string; data: unknown }, id = `msg_${++n}`) {
	const body = JSON.stringify({ business_id: "bus_1", timestamp: CREATED, ...event });
	const ts = new Date();
	return new Request("http://x.test/api/billing/webhook", {
		method: "POST",
		headers: {
			"webhook-id": id,
			"webhook-timestamp": String(Math.floor(ts.getTime() / 1000)),
			"webhook-signature": new Webhook(SECRET).sign(id, ts, body),
		},
		body,
	});
}

describe("POST /api/billing/webhook", () => {
	let sqlite: ReturnType<typeof freshDb>["sqlite"];
	let db: ReturnType<typeof freshDb>["db"];
	/** Dodo's current truth, by sub id. */
	let dodoSubs: Record<string, Subscription>;
	let retrieves: string[];
	let captured: { event: string; organizationId: string; userId: string }[];
	let deps: BillingWebhookDeps;

	const row = async () =>
		(await db.select().from(orgBilling).where(eq(orgBilling.organizationId, "o1")))[0];

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
			INSERT INTO orgBilling (organizationId, createdByUserId, country, dodoCustomerId, subscriptionId, status, trialEndsAt, nextBillingDate, needsSubscription, syncedAt)
				VALUES ('o1', 'u1', 'IN', 'cus_1', 'sub_a', 'active', ${Date.parse(TRIAL_ENDS)}, ${Date.parse(TRIAL_ENDS)}, 0, 0);
		`);
		dodoSubs = { sub_a: sub({ subscription_id: "sub_a" }) };
		retrieves = [];
		captured = [];
		const real = new DodoPayments({
			bearerToken: "test",
			webhookKey: SECRET,
			environment: "test_mode",
		});
		deps = {
			db,
			dodo: {
				webhooks: real.webhooks,
				subscriptions: {
					retrieve: async (id: string) => {
						retrieves.push(id);
						const s = dodoSubs[id];
						if (!s) throw new Error(`404 ${id}`);
						return s;
					},
				},
			},
			capture: (event, p) => captured.push({ event, ...p }),
			now: () => NOW,
		};
	});

	it("bad signature → 401, nothing written", async () => {
		const req = signed({ type: "subscription.active", data: dodoSubs.sub_a });
		req.headers.set("webhook-signature", "v1,AAAA");
		const res = await handleBillingWebhook(req, deps);
		expect(res.status).toBe(401);
		expect(sqlite.prepare("SELECT count(*) c FROM billingWebhookEvent").get()).toEqual({ c: 0 });
	});

	it("card added → row mirrors Dodo, billing_subscribed fired", async () => {
		dodoSubs.sub_a = sub({ subscription_id: "sub_a", has_payment_method: true });
		const res = await handleBillingWebhook(
			signed({ type: "subscription.update_payment_method", data: dodoSubs.sub_a }),
			deps
		);
		expect(res.status).toBe(200);
		expect(await row()).toMatchObject({
			subscriptionId: "sub_a",
			status: "active",
			hasPaymentMethod: true,
			trialEndsAt: new Date(TRIAL_ENDS),
			nextBillingDate: new Date(TRIAL_ENDS),
			recurringPreTaxAmount: 500,
			needsSubscription: false,
			syncedAt: NOW,
		});
		expect(captured).toEqual([{ event: "billing_subscribed", organizationId: "o1", userId: "u1" }]);
	});

	it("duplicate webhook-id → 200, no second pull", async () => {
		const first = signed({ type: "subscription.active", data: dodoSubs.sub_a }, "msg_dup");
		const again = signed({ type: "subscription.active", data: dodoSubs.sub_a }, "msg_dup");
		expect((await handleBillingWebhook(first, deps)).status).toBe(200);
		expect((await handleBillingWebhook(again, deps)).status).toBe(200);
		expect(retrieves).toEqual(["sub_a"]);
	});

	it("unknown org → 200, nothing pulled", async () => {
		const stray = sub({
			subscription_id: "sub_z",
			customer: { customer_id: "cus_z", email: "", name: "" },
			metadata: { organizationId: "nope" },
		});
		const res = await handleBillingWebhook(
			signed({ type: "subscription.active", data: stray }),
			deps
		);
		expect(res.status).toBe(200);
		expect(retrieves).toEqual([]);
	});

	it("non-billing event types → 200, ignored", async () => {
		const res = await handleBillingWebhook(signed({ type: "refund.succeeded", data: {} }), deps);
		expect(res.status).toBe(200);
		expect(retrieves).toEqual([]);
	});

	it("payment event without metadata → org found by Dodo customer", async () => {
		dodoSubs.sub_a = sub({ subscription_id: "sub_a", status: "on_hold" });
		const res = await handleBillingWebhook(
			signed({
				type: "payment.failed",
				data: {
					payment_id: "pay_1",
					subscription_id: "sub_a",
					customer: { customer_id: "cus_1", email: "", name: "" },
					metadata: {},
				},
			}),
			deps
		);
		expect(res.status).toBe(200);
		expect((await row()).status).toBe("on_hold");
	});

	it("out of order: stale payload ends in Dodo's latest state", async () => {
		// Dodo already recovered the sub; a delayed past_due event arrives afterwards.
		dodoSubs.sub_a = sub({ subscription_id: "sub_a", has_payment_method: true });
		await handleBillingWebhook(
			signed({
				type: "subscription.past_due",
				data: {
					...sub({ subscription_id: "sub_a", status: "past_due", has_payment_method: true }),
					past_due_ends_at: "2026-11-27T00:00:00.000Z",
				},
			}),
			deps
		);
		expect(await row()).toMatchObject({ status: "active", pastDueEndsAt: null });
	});

	it("past_due stores past_due_ends_at from the payload → grace, payment_failed", async () => {
		const pastDue = sub({ subscription_id: "sub_a", status: "past_due", has_payment_method: true });
		sqlite.exec("UPDATE orgBilling SET hasPaymentMethod = 1");
		dodoSubs.sub_a = pastDue;
		await handleBillingWebhook(
			signed({
				type: "subscription.past_due",
				data: { ...pastDue, past_due_ends_at: "2026-11-27T00:00:00.000Z" },
			}),
			deps
		);
		expect(await row()).toMatchObject({
			status: "past_due",
			pastDueEndsAt: new Date("2026-11-27T00:00:00.000Z"),
		});
		expect(captured.map((c) => c.event)).toEqual(["billing_payment_failed"]);
	});

	it("re-subscribe: new sub replaces a terminal one → billing_resubscribed", async () => {
		sqlite.exec("UPDATE orgBilling SET status = 'cancelled'");
		dodoSubs.sub_b = sub({
			subscription_id: "sub_b",
			created_at: "2026-11-19T00:00:00.000Z",
			trial_period_days: 0,
			next_billing_date: "2026-12-19T00:00:00.000Z",
			has_payment_method: true,
		});
		const res = await handleBillingWebhook(
			signed({ type: "subscription.active", data: dodoSubs.sub_b }),
			deps
		);
		expect(res.status).toBe(200);
		expect(await row()).toMatchObject({
			subscriptionId: "sub_b",
			status: "active",
			trialEndsAt: new Date("2026-11-19T00:00:00.000Z"),
		});
		expect(captured.map((c) => c.event).sort()).toEqual([
			"billing_resubscribed",
			"billing_subscribed",
		]);
	});

	it("stray non-current sub while current is live → ignored", async () => {
		dodoSubs.sub_b = sub({ subscription_id: "sub_b", status: "on_hold" });
		const res = await handleBillingWebhook(
			signed({ type: "subscription.on_hold", data: dodoSubs.sub_b }),
			deps
		);
		expect(res.status).toBe(200);
		expect(retrieves).toEqual([]);
		expect(await row()).toMatchObject({ subscriptionId: "sub_a", status: "active" });
	});

	it("Dodo down while pulling → 500, and the retry is processed (not deduped)", async () => {
		const failing = {
			...deps,
			dodo: {
				...deps.dodo,
				subscriptions: {
					retrieve: async () => {
						throw new Error("dodo down");
					},
				},
			},
		};
		const res = await handleBillingWebhook(
			signed({ type: "subscription.active", data: dodoSubs.sub_a }, "msg_retry"),
			failing
		);
		expect(res.status).toBe(500);
		const retry = await handleBillingWebhook(
			signed({ type: "subscription.active", data: dodoSubs.sub_a }, "msg_retry"),
			deps
		);
		expect(retry.status).toBe(200);
		expect(retrieves).toEqual(["sub_a"]);
	});

	it("trial clock: trialEndsAt = created_at + trial_period_days", async () => {
		dodoSubs.sub_a = sub({ subscription_id: "sub_a", trial_period_days: 10 });
		await handleBillingWebhook(
			signed({ type: "subscription.updated", data: dodoSubs.sub_a }),
			deps
		);
		expect((await row()).trialEndsAt).toEqual(new Date(Date.parse(CREATED) + 10 * DAY));
	});
});
