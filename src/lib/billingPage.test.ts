import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "@/test/sqliteDb";
import { orgBilling, organization, user } from "@/db/schema";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/posthog-server", () => ({
	captureBillingEvent: vi.fn(),
}));
vi.mock("@/middleware/org", () => ({ orgMiddleware: {}, orgMiddlewareAllowLocked: {} }));

const { loadBillingPage, setCancelAtPeriodEnd, startCheckout, invoicePdf, syncBilling } =
	await import("./billing");

const DAY = 86_400_000;
const NOW = new Date("2026-11-14T10:00:00.000Z");

/** Dodo with one sub whose status / cancel flag the test can change; `update` writes through. */
function fakeDodo() {
	const sub = {
		status: "active",
		cancel_at_next_billing_date: false,
		has_payment_method: false,
		created_at: "2026-11-14T10:00:00.000Z",
		next_billing_date: "2026-11-29T10:00:00.000Z",
	};
	return {
		sub,
		customers: {
			create: vi.fn(async (_: unknown) => ({ customer_id: "cus_1" })),
			retrieve: vi.fn(async (_: string) => ({ customer_id: "cus_1", email: "bills@acme.org" })),
			retrievePaymentMethods: vi.fn(async (_: string) => ({
				items: [
					{
						payment_method: "card",
						payment_method_id: "pm_1",
						card: {
							card_network: "Visa",
							last4_digits: "4242",
							expiry_month: "08",
							expiry_year: "28",
						},
					},
				],
			})),
		},
		subscriptions: {
			create: vi.fn(async (_: unknown) => ({ subscription_id: "sub_1" })),
			retrieve: vi.fn(async (id: string) => ({
				subscription_id: id,
				customer: { customer_id: "cus_1" },
				trial_period_days: 15,
				recurring_pre_tax_amount: 500,
				...sub,
			})),
			list: vi.fn(async (_: unknown) => ({
				items: [] as { subscription_id: string; status: string; created_at: string }[],
			})),
			update: vi.fn(async (_id: string, body: { cancel_at_next_billing_date?: boolean }) => {
				if (body.cancel_at_next_billing_date !== undefined) {
					sub.cancel_at_next_billing_date = body.cancel_at_next_billing_date;
				}
				return {};
			}),
		},
		payments: {
			list: vi.fn(async (_: unknown) => ({
				items: [
					{
						payment_id: "pay_2",
						created_at: "2026-12-29T10:00:00.000Z",
						total_amount: 590,
						currency: "USD",
						status: "succeeded",
						customer: { customer_id: "cus_1" },
					},
					{
						payment_id: "pay_1",
						created_at: "2026-11-29T10:00:00.000Z",
						total_amount: 590,
						currency: "USD",
						status: "failed",
						customer: { customer_id: "cus_1" },
					},
				],
			})),
			retrieve: vi.fn(async (id: string) => ({
				payment_id: id,
				customer: { customer_id: id === "pay_other" ? "cus_other" : "cus_1" },
			})),
		},
		invoices: {
			payments: {
				retrieve: vi.fn(
					async (_: string) =>
						new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } })
				),
			},
		},
		checkoutSessions: {
			create: vi.fn(async (_: unknown) => ({
				session_id: "cks_1",
				checkout_url: "https://checkout.dodo/cks_1",
			})),
		},
	};
}

let fresh: ReturnType<typeof freshDb>;
let dodo: ReturnType<typeof fakeDodo>;
const deps = () => ({
	db: fresh.db,
	dodo: dodo as never,
	productId: "pdt_x",
	appUrl: "https://app.test",
	now: () => NOW,
});
const row = () =>
	fresh.db.query.orgBilling.findFirst({ where: eq(orgBilling.organizationId, "o1") });
const setRow = (set: Partial<typeof orgBilling.$inferInsert>) =>
	fresh.db.update(orgBilling).set(set).where(eq(orgBilling.organizationId, "o1"));

/** Row as the webhook leaves it for a live Trial sub. */
const subscribedRow = {
	dodoCustomerId: "cus_1",
	subscriptionId: "sub_1",
	status: "active",
	needsSubscription: false,
	nextBillingDate: new Date("2026-11-29T10:00:00.000Z"),
	recurringPreTaxAmount: 500,
} as const;

beforeEach(async () => {
	fresh = freshDb();
	dodo = fakeDodo();
	await fresh.db.insert(user).values({ id: "u1", name: "Creator", email: "creator@acme.org" });
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

describe("loadBillingPage", () => {
	it("Trial with no sub yet: starts it, then shows Dodo's view", async () => {
		const page = await loadBillingPage("o1", deps());

		expect(dodo.subscriptions.create).toHaveBeenCalledTimes(1);
		expect(page).toMatchObject({
			access: { state: "trialing", trialDaysLeft: 15, hasPaymentMethod: false },
			orgName: "Acme",
			country: "IN",
			recurringPreTaxAmount: 500,
			receiptEmail: "bills@acme.org",
		});
	});

	it("card + invoices from Dodo; PDF only for paid payments", async () => {
		await setRow({ ...subscribedRow, hasPaymentMethod: true });

		const page = await loadBillingPage("o1", deps());

		expect(dodo.payments.list).toHaveBeenCalledWith(
			expect.objectContaining({ customer_id: "cus_1" })
		);
		expect(page.paymentMethod).toEqual({
			network: "Visa",
			last4: "4242",
			expMonth: "08",
			expYear: "28",
		});
		expect(page.invoices).toEqual([
			{
				paymentId: "pay_2",
				date: new Date("2026-12-29T10:00:00.000Z"),
				amount: 590,
				currency: "USD",
				status: "succeeded",
				hasPdf: true,
			},
			{
				paymentId: "pay_1",
				date: new Date("2026-11-29T10:00:00.000Z"),
				amount: 590,
				currency: "USD",
				status: "failed",
				hasPdf: false,
			},
		]);
	});

	it("Dodo reads down: page still loads from the row", async () => {
		await setRow(subscribedRow);
		dodo.payments.list.mockRejectedValueOnce(new Error("dodo down"));
		dodo.customers.retrievePaymentMethods.mockRejectedValueOnce(new Error("dodo down"));
		dodo.customers.retrieve.mockRejectedValueOnce(new Error("dodo down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await loadBillingPage("o1", deps())).toMatchObject({
			access: { state: "trialing" },
			paymentMethod: null,
			invoices: [],
			receiptEmail: null,
			dodoUnavailable: true,
		});
	});
});

describe("setCancelAtPeriodEnd", () => {
	beforeEach(() => setRow(subscribedRow));

	it("cancel during Trial → canceling until period end; resume → back to trialing", async () => {
		const canceled = await setCancelAtPeriodEnd("o1", true, deps());

		expect(dodo.subscriptions.update).toHaveBeenCalledWith("sub_1", {
			cancel_at_next_billing_date: true,
		});
		expect(canceled).toMatchObject({
			state: "canceling",
			accessEndsAt: new Date("2026-11-29T10:00:00.000Z"),
		});
		expect(await row()).toMatchObject({ cancelAtNextBillingDate: true });

		expect(await setCancelAtPeriodEnd("o1", false, deps())).toMatchObject({ state: "trialing" });
		expect(await row()).toMatchObject({ cancelAtNextBillingDate: false });
	});

	it("only from the right state: no Dodo call otherwise", async () => {
		await expect(setCancelAtPeriodEnd("o1", false, deps())).rejects.toMatchObject({
			kind: "Conflict",
		});
		await setRow({ status: "past_due" });
		await expect(setCancelAtPeriodEnd("o1", true, deps())).rejects.toMatchObject({
			kind: "Conflict",
		});
		expect(dodo.subscriptions.update).not.toHaveBeenCalled();
	});
});

describe("startCheckout", () => {
	it("ended sub: new checkout, no Trial, no coupons, back to billing", async () => {
		await setRow({ ...subscribedRow, status: "cancelled" });

		expect(await startCheckout("o1", deps())).toBe("https://checkout.dodo/cks_1");
		expect(dodo.checkoutSessions.create).toHaveBeenCalledWith({
			product_cart: [{ product_id: "pdt_x", quantity: 1 }],
			customer: { customer_id: "cus_1" },
			subscription_data: { trial_period_days: 0 },
			metadata: { organizationId: "o1" },
			return_url: "https://app.test/locked?from=dodo",
			feature_flags: { allow_discount_code: false },
		});
	});

	it("refused while the current sub can still be fixed in the portal", async () => {
		await setRow(subscribedRow);
		await expect(startCheckout("o1", deps())).rejects.toMatchObject({ kind: "Conflict" });
		expect(dodo.checkoutSessions.create).not.toHaveBeenCalled();
	});
});

describe("syncBilling (back from Dodo)", () => {
	it("pulls the row's current sub", async () => {
		await setRow(subscribedRow);
		dodo.sub.has_payment_method = true;

		expect(await syncBilling("o1", deps())).toMatchObject({ hasPaymentMethod: true });
		expect(dodo.subscriptions.list).not.toHaveBeenCalled();
	});

	it("re-subscribe checkout: finds the customer's new sub before the webhook and adopts it", async () => {
		await setRow({ ...subscribedRow, status: "cancelled" });
		dodo.sub.status = "cancelled";
		const retrieve = dodo.subscriptions.retrieve.getMockImplementation()!;
		dodo.subscriptions.retrieve.mockImplementation(async (id: string) => ({
			...(await retrieve(id)),
			...(id === "sub_2" && { status: "active" }),
		}));
		dodo.subscriptions.list.mockResolvedValueOnce({
			items: [
				{ subscription_id: "sub_2", status: "active", created_at: "2026-11-14T09:00:00.000Z" },
				{ subscription_id: "sub_1", status: "cancelled", created_at: "2026-10-01T00:00:00.000Z" },
			],
		});

		expect(await syncBilling("o1", deps())).toMatchObject({ locked: false });
		expect(dodo.subscriptions.list).toHaveBeenCalledWith(
			expect.objectContaining({ customer_id: "cus_1" })
		);
		expect(await row()).toMatchObject({ subscriptionId: "sub_2", status: "active" });
	});

	it("ended sub, no new one at Dodo yet: row unchanged, still locked", async () => {
		await setRow({ ...subscribedRow, status: "cancelled" });
		dodo.sub.status = "cancelled";

		expect(await syncBilling("o1", deps())).toMatchObject({ lockReason: "canceled" });
		expect(await row()).toMatchObject({ subscriptionId: "sub_1" });
	});
});

describe("invoicePdf", () => {
	beforeEach(() => setRow(subscribedRow));

	it("streams the PDF of the org's own payment", async () => {
		const res = await invoicePdf("o1", "pay_2", deps());

		expect(res.headers.get("content-type")).toBe("application/pdf");
		expect(res.headers.get("content-disposition")).toBe('inline; filename="invoice-pay_2.pdf"');
		expect(await res.text()).toBe("%PDF-1.4");
	});

	it("another customer's payment is NotFound, PDF never fetched", async () => {
		await expect(invoicePdf("o1", "pay_other", deps())).rejects.toMatchObject({
			kind: "NotFound",
		});
		expect(dodo.invoices.payments.retrieve).not.toHaveBeenCalled();
	});
});
