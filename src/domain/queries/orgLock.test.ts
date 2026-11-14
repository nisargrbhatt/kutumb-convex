import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "@/test/sqliteDb";
import { listMemberOrgs, loadOrgLock, loadOrgMembership } from "./orgLock";

const T0 = new Date("2026-11-14T00:00:00.000Z").getTime();
const DAY = 86_400_000;
const now = new Date(T0);

describe("loadOrgMembership", () => {
	let sqlite: DatabaseSync;
	let db: ReturnType<typeof freshDb>["db"];
	let statements: number;

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m1', 'o1', 'u1', 'admin', 0);
			INSERT INTO orgBilling (organizationId, createdByUserId, country, trialEndsAt, syncedAt)
				VALUES ('o1', 'u1', 'IN', ${T0 + DAY}, 0);
		`);
		statements = 0;
		const prepare = sqlite.prepare.bind(sqlite);
		sqlite.prepare = ((sql: string) => {
			statements++;
			return prepare(sql);
		}) as typeof sqlite.prepare;
	});

	it("member of an open org → role, no lock, one statement", async () => {
		await expect(loadOrgMembership(db, "o1", "u1", now)).resolves.toEqual({ role: "admin" });
		expect(statements).toBe(1);
	});

	it("non-member → null", async () => {
		await expect(loadOrgMembership(db, "o1", "u2", now)).resolves.toBeNull();
	});

	it("trial over → lockReason; paying (row → active) unlocks on the next call", async () => {
		const later = new Date(T0 + 2 * DAY);
		await expect(loadOrgMembership(db, "o1", "u1", later)).resolves.toEqual({
			role: "admin",
			lockReason: "trial_ended",
		});
		sqlite.exec(
			`UPDATE orgBilling SET status = 'active', needsSubscription = 0, hasPaymentMethod = 1, nextBillingDate = ${T0 + 30 * DAY}`
		);
		await expect(loadOrgMembership(db, "o1", "u1", later)).resolves.toEqual({ role: "admin" });
	});

	it("no billing row → locked (default-deny)", async () => {
		sqlite.exec("DELETE FROM orgBilling");
		await expect(loadOrgMembership(db, "o1", "u1", now)).resolves.toEqual({
			role: "admin",
			lockReason: "trial_ended",
		});
	});

	it("listMemberOrgs: every org of the user, locked ones flagged, one statement", async () => {
		sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Bhatt', 'o2', 0);
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m2', 'o2', 'u1', 'owner', 0);
		`);
		statements = 0;
		await expect(listMemberOrgs(db, "u1", now)).resolves.toEqual([
			{ id: "o2", name: "Bhatt", slug: "o2", role: "owner", lockReason: "trial_ended" },
			{ id: "o1", name: "Org 1", slug: "o1", role: "admin" },
		]);
		expect(statements).toBe(1);
	});

	it("loadOrgLock: same rule by org alone", async () => {
		await expect(loadOrgLock(db, "o1", now)).resolves.toBeUndefined();
		await expect(loadOrgLock(db, "o1", new Date(T0 + 2 * DAY))).resolves.toBe("trial_ended");
	});
});
