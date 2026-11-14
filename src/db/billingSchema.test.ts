import { describe, expect, it } from "vitest";
import { freshDb } from "@/test/sqliteDb";

describe("billing tables", () => {
	it("orgBilling and billingNotice rows cascade on org delete", () => {
		const { sqlite } = freshDb();
		sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
			INSERT INTO orgBilling (organizationId, createdByUserId, country, trialEndsAt, syncedAt)
				VALUES ('o1', 'u1', 'IN', 0, 0), ('o2', 'u1', 'IN', 0, 0);
			INSERT INTO billingNotice (organizationId, kind, anchor, sentAt)
				VALUES ('o1', 'trial_t3', '2026-11-29T00:00:00.000Z', 0), ('o2', 'locked', 'x', 0);
		`);

		sqlite.exec(`DELETE FROM organization WHERE id = 'o1'`);

		const left = (table: string) =>
			sqlite
				.prepare(`SELECT organizationId FROM ${table}`)
				.all()
				.map((r) => r.organizationId);
		expect(left("orgBilling")).toEqual(["o2"]);
		expect(left("billingNotice")).toEqual(["o2"]);
	});

	it("billingNotice dedupes on (org, kind, anchor)", () => {
		const { sqlite } = freshDb();
		sqlite.exec(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0)`
		);
		const insert = sqlite.prepare(
			`INSERT OR IGNORE INTO billingNotice (organizationId, kind, anchor, sentAt) VALUES ('o1', ?, ?, 0)`
		);
		expect(insert.run("trial_t3", "a").changes).toBe(1);
		expect(insert.run("trial_t3", "a").changes).toBe(0);
		expect(insert.run("trial_t1", "a").changes).toBe(1);
		expect(insert.run("trial_t3", "b").changes).toBe(1);
	});
});
