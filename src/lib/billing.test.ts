import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "@/test/sqliteDb";
import { orgBilling, organization, user } from "@/db/schema";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/lib/posthog-server", () => ({ captureBillingTrialStarted: vi.fn() }));
vi.mock("@/middleware/org", () => ({ orgMiddleware: {}, orgMiddlewareAllowLocked: {} }));

const { ensureSubscription, startOrgBilling } = await import("./billing");

const DAY = 86_400_000;
const NOW = new Date("2026-11-14T10:00:00.000Z");
const SUB_CREATED = "2026-11-14T10:00:01.000Z";

function fakeDodo() {
	return {
		customers: {
			create: vi.fn(async (_: unknown) => ({ customer_id: "cus_1" })),
		},
		subscriptions: {
			create: vi.fn(async (_: unknown) => ({ subscription_id: "sub_1" })),
			retrieve: vi.fn(async (id: string) => ({
				subscription_id: id,
				customer: { customer_id: "cus_1" },
				status: "active",
				created_at: SUB_CREATED,
				trial_period_days: 15,
				next_billing_date: "2026-11-29T10:00:01.000Z",
				cancel_at_next_billing_date: false,
				has_payment_method: false,
				recurring_pre_tax_amount: 500,
			})),
		},
	};
}

let fresh: ReturnType<typeof freshDb>;
let dodo: ReturnType<typeof fakeDodo>;

const run = () =>
	ensureSubscription("o1", {
		db: fresh.db,
		dodo: dodo as never,
		productId: "pdt_x",
		now: () => NOW,
	});
const row = () =>
	fresh.db.query.orgBilling.findFirst({ where: eq(orgBilling.organizationId, "o1") });

beforeEach(async () => {
	fresh = freshDb();
	dodo = fakeDodo();
	await fresh.db.insert(user).values({ id: "u1", name: "Creator", email: "creator@example.org" });
	await fresh.db
		.insert(organization)
		.values({ id: "o1", name: "Acme", slug: "acme", createdAt: new Date(NOW) });
	await fresh.db.insert(orgBilling).values({
		organizationId: "o1",
		createdByUserId: "u1",
		country: "IN",
		trialEndsAt: new Date(NOW.getTime() + 15 * DAY),
		syncedAt: NOW,
	});
});

describe("startOrgBilling", () => {
	beforeEach(() => fresh.db.delete(orgBilling));

	const start = () =>
		startOrgBilling(
			{ organizationId: "o1", createdByUserId: "u1", country: "IN", createdAt: NOW },
			{ db: fresh.db, dodo: dodo as never, productId: "pdt_x", now: () => NOW }
		);

	it("new org trials on Dodo's clock", async () => {
		expect(await start()).toMatchObject({
			subscribed: true,
			trialEndsAt: new Date("2026-11-29T10:00:01.000Z"),
		});
		expect(await row()).toMatchObject({ country: "IN", needsSubscription: false });
	});

	it("Dodo down: org still gets a row, trials 15d from its createdAt, needsSubscription", async () => {
		dodo.customers.create.mockRejectedValueOnce(new Error("dodo down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await start()).toMatchObject({
			subscribed: false,
			trialEndsAt: new Date(NOW.getTime() + 15 * DAY),
		});
		expect(await row()).toMatchObject({ needsSubscription: true, createdByUserId: "u1" });
	});
});

describe("ensureSubscription", () => {
	it("starts the card-less Trial: customer (org name, creator email) + sub, row mirrors Dodo", async () => {
		const res = await run();

		expect(res.success).toBe(true);
		expect(dodo.customers.create).toHaveBeenCalledWith({
			name: "Acme",
			email: "creator@example.org",
			metadata: { organizationId: "o1" },
		});
		expect(dodo.subscriptions.create).toHaveBeenCalledWith({
			customer: { customer_id: "cus_1" },
			product_id: "pdt_x",
			quantity: 1,
			billing: { country: "IN" },
			payment_link: false,
			metadata: { organizationId: "o1" },
		});
		expect(await row()).toMatchObject({
			dodoCustomerId: "cus_1",
			subscriptionId: "sub_1",
			status: "active",
			needsSubscription: false,
			hasPaymentMethod: false,
			cancelAtNextBillingDate: false,
			recurringPreTaxAmount: 500,
			trialEndsAt: new Date("2026-11-29T10:00:01.000Z"),
			nextBillingDate: new Date("2026-11-29T10:00:01.000Z"),
			syncedAt: NOW,
		});
	});

	it("Dodo down at customer create: row stays needsSubscription; retry creates each once", async () => {
		dodo.customers.create.mockRejectedValueOnce(new Error("dodo down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect((await run()).success).toBe(false);
		expect(await row()).toMatchObject({ dodoCustomerId: null, needsSubscription: true });
		expect(dodo.subscriptions.create).not.toHaveBeenCalled();

		expect((await run()).success).toBe(true);
		expect(dodo.customers.create).toHaveBeenCalledTimes(2);
		expect(dodo.subscriptions.create).toHaveBeenCalledTimes(1);
		expect(await row()).toMatchObject({ subscriptionId: "sub_1", needsSubscription: false });
	});

	it("sub create fails after customer exists: retry never creates a second customer", async () => {
		dodo.subscriptions.create.mockRejectedValueOnce(new Error("dodo down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect((await run()).success).toBe(false);
		expect(await row()).toMatchObject({ dodoCustomerId: "cus_1", subscriptionId: null });

		expect((await run()).success).toBe(true);
		expect(dodo.customers.create).toHaveBeenCalledTimes(1);
		expect(dodo.subscriptions.create).toHaveBeenCalledTimes(2);
	});

	it("pull fails after sub created: retry only pulls, never a second sub", async () => {
		dodo.subscriptions.retrieve.mockRejectedValueOnce(new Error("dodo down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect((await run()).success).toBe(false);
		expect(await row()).toMatchObject({ subscriptionId: "sub_1", needsSubscription: true });

		expect((await run()).success).toBe(true);
		expect(dodo.customers.create).toHaveBeenCalledTimes(1);
		expect(dodo.subscriptions.create).toHaveBeenCalledTimes(1);
		expect(await row()).toMatchObject({ needsSubscription: false, status: "active" });
	});

	it("org already has its sub: no Dodo calls", async () => {
		await run();
		dodo = fakeDodo();

		expect((await run()).success).toBe(true);
		expect(dodo.customers.create).not.toHaveBeenCalled();
		expect(dodo.subscriptions.create).not.toHaveBeenCalled();
		expect(dodo.subscriptions.retrieve).not.toHaveBeenCalled();
	});
});
