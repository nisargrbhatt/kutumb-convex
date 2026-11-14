import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "@/test/sqliteDb";
import { loadActiveOrgBilling } from "./activeOrgBilling";

const T0 = new Date("2026-11-14T00:00:00.000Z").getTime();
const DAY = 86_400_000;

describe("loadActiveOrgBilling", () => {
	let sqlite: DatabaseSync;
	let db: ReturnType<typeof freshDb>["db"];

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
				('u1', 'Asha', 'a@x.test', 1, 0, 0),
				('u2', 'Bina', 'b@x.test', 1, 0, 0),
				('u3', 'Chetan', 'c@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Bhatt Family', 'o1', 0);
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
				('m1', 'o1', 'u1', 'owner', 1),
				('m2', 'o1', 'u2', 'member', 2),
				('m3', 'o1', 'u3', 'owner', 3);
			INSERT INTO orgBilling (organizationId, createdByUserId, country, trialEndsAt, syncedAt, recurringPreTaxAmount)
				VALUES ('o1', 'u1', 'IN', ${T0 + DAY}, 0, 500);
		`);
	});

	it("owner of a trialing org: access, owner names oldest first, price", async () => {
		const r = await loadActiveOrgBilling(db, "o1", "u1", new Date(T0));
		expect(r).toMatchObject({
			orgName: "Bhatt Family",
			role: "owner",
			isOwner: true,
			ownerNames: ["Asha", "Chetan"],
			price: "$5",
			access: { state: "trialing", locked: false, trialDaysLeft: 1 },
		});
	});

	it("member after trial end: locked, no price", async () => {
		const r = await loadActiveOrgBilling(db, "o1", "u2", new Date(T0 + 2 * DAY));
		expect(r).toMatchObject({
			role: "member",
			isOwner: false,
			price: null,
			access: { state: "locked", locked: true, lockReason: "trial_ended" },
		});
	});

	it("no billing row → locked trial_ended (default-deny)", async () => {
		sqlite.exec("DELETE FROM orgBilling");
		const r = await loadActiveOrgBilling(db, "o1", "u1", new Date(T0));
		expect(r?.access).toMatchObject({ locked: true, lockReason: "trial_ended" });
	});

	it("non-member → null", async () => {
		await expect(loadActiveOrgBilling(db, "o1", "nobody", new Date(T0))).resolves.toBeNull();
	});
});
