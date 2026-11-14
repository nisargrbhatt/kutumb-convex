import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb } from "@/test/sqliteDb";
import { member, orgBilling, organization, user } from "@/db/schema";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("cloudflare:workers", () => ({ env: {} }));

const { cancelSubscriptionForDelete, syncBillingEmail, syncCustomerName } =
	await import("./billingCustomerSync");

const NOW = new Date("2026-11-14T10:00:00.000Z");

function fakeDodo() {
	return {
		customers: {
			update: vi.fn(async (_id: string, _body: unknown) => ({})),
			retrieve: vi.fn(async (_id: string): Promise<{ email: string }> => ({ email: "" })),
		},
		subscriptions: {
			update: vi.fn(async (_id: string, _body: unknown) => ({})),
		},
	};
}

let fresh: ReturnType<typeof freshDb>;
let dodo: ReturnType<typeof fakeDodo>;
const deps = () => ({ db: fresh.db, dodo: dodo as never });

beforeEach(async () => {
	fresh = freshDb();
	dodo = fakeDodo();
	vi.spyOn(console, "error").mockImplementation(() => {});
	await fresh.db
		.insert(organization)
		.values({ id: "o1", name: "Acme", slug: "acme", createdAt: NOW });
	await fresh.db.insert(orgBilling).values({
		organizationId: "o1",
		createdByUserId: "u1",
		country: "IN",
		dodoCustomerId: "cus_1",
		trialEndsAt: NOW,
		syncedAt: NOW,
	});
});

describe("syncCustomerName", () => {
	it("renamed org → Dodo customer name", async () => {
		await syncCustomerName("o1", "Acme Family", deps());
		expect(dodo.customers.update).toHaveBeenCalledWith("cus_1", { name: "Acme Family" });
	});

	it("Dodo down: rename still succeeds, failure logged", async () => {
		dodo.customers.update.mockRejectedValueOnce(new Error("dodo down"));
		await expect(syncCustomerName("o1", "Acme Family", deps())).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});

describe("syncBillingEmail", () => {
	const DAY = 86_400_000;
	beforeEach(async () => {
		await fresh.db.insert(user).values([
			{ id: "u1", name: "Creator", email: "creator@example.org" },
			{ id: "u2", name: "Elder", email: "elder@example.org" },
			{ id: "u3", name: "Newer", email: "newer@example.org" },
			{ id: "u4", name: "Admin", email: "admin@example.org" },
		]);
		// u1 already gone / demoted; u4 is the oldest member but only an admin.
		await fresh.db.insert(member).values([
			{ id: "m4", organizationId: "o1", userId: "u4", role: "admin", createdAt: NOW },
			{
				id: "m2",
				organizationId: "o1",
				userId: "u2",
				role: "owner",
				createdAt: new Date(NOW.getTime() + DAY),
			},
			{
				id: "m3",
				organizationId: "o1",
				userId: "u3",
				role: "owner",
				createdAt: new Date(NOW.getTime() + 2 * DAY),
			},
		]);
	});

	it("billing-email user stops being owner → longest-standing remaining owner's email", async () => {
		dodo.customers.retrieve.mockResolvedValueOnce({ email: "creator@example.org" });
		await syncBillingEmail("o1", "creator@example.org", deps());
		expect(dodo.customers.update).toHaveBeenCalledWith("cus_1", { email: "elder@example.org" });
	});

	it("someone else stops being owner → billing email untouched", async () => {
		dodo.customers.retrieve.mockResolvedValueOnce({ email: "creator@example.org" });
		await syncBillingEmail("o1", "newer@example.org", deps());
		expect(dodo.customers.update).not.toHaveBeenCalled();
	});

	it("Dodo down: never throws, failure logged", async () => {
		dodo.customers.retrieve.mockRejectedValueOnce(new Error("dodo down"));
		await expect(syncBillingEmail("o1", "creator@example.org", deps())).resolves.toBeUndefined();
		expect(console.error).toHaveBeenCalled();
	});
});

describe("cancelSubscriptionForDelete", () => {
	const setSub = (subscriptionId: string | null, status: "active" | "cancelled" | null) =>
		fresh.db.update(orgBilling).set({ subscriptionId, status });

	it("live sub → cancelled now in Dodo", async () => {
		await setSub("sub_1", "active");
		await cancelSubscriptionForDelete("o1", deps());
		expect(dodo.subscriptions.update).toHaveBeenCalledWith("sub_1", { status: "cancelled" });
	});

	it("no sub or terminal sub → skip", async () => {
		await setSub(null, null);
		await cancelSubscriptionForDelete("o1", deps());
		await setSub("sub_1", "cancelled");
		await cancelSubscriptionForDelete("o1", deps());
		expect(dodo.subscriptions.update).not.toHaveBeenCalled();
	});

	it("Dodo error → delete refused with retry message", async () => {
		await setSub("sub_1", "active");
		dodo.subscriptions.update.mockRejectedValueOnce(new Error("dodo down"));
		await expect(cancelSubscriptionForDelete("o1", deps())).rejects.toThrow(
			"Couldn't cancel the subscription, try again"
		);
	});
});
