import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { changeRequest } from "@/db/schema";
import { applyMigrations, freshDb } from "@/test/sqliteDb";

describe("0007 change request migration", () => {
	it("backfills one pending create request per existing draft profile", async () => {
		const { sqlite, db } = freshDb({ before: "0007" });
		sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
			INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES
				('d1', 'Asha', 'Doe', 'draft', 'o1'),
				('d2', 'Bina', 'Roe', 'draft', 'o1'),
				('a1', 'Chitra', 'Poe', 'active', 'o1');
		`);

		applyMigrations(sqlite, { from: "0007" });

		const rows = await db
			.select()
			.from(changeRequest)
			.where(eq(changeRequest.organizationId, "o1"))
			.orderBy(changeRequest.profileId);
		expect(
			rows.map((r) => ({
				profileId: r.profileId,
				profileName: r.profileName,
				kind: r.kind,
				status: r.status,
				payload: r.payload,
				submitterUserId: r.submitterUserId,
				submitterName: r.submitterName,
			}))
		).toEqual([
			{
				profileId: "d1",
				profileName: "Asha Doe",
				kind: "create",
				status: "pending",
				payload: null,
				submitterUserId: null,
				submitterName: "Unknown",
			},
			{
				profileId: "d2",
				profileName: "Bina Roe",
				kind: "create",
				status: "pending",
				payload: null,
				submitterUserId: null,
				submitterName: "Unknown",
			},
		]);
		expect(new Set(rows.map((r) => r.id)).size).toBe(2);
		expect(rows.every((r) => r.createdAt instanceof Date && r.createdAt.getTime() > 0)).toBe(true);
		const audit = sqlite.prepare("SELECT count(*) AS n FROM auditEvent").get() as { n: number };
		expect(audit.n).toBe(0);
	});

	it("applies on a fresh db; new rows get version 0", () => {
		const { sqlite } = freshDb();
		sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
			INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES ('p', 'A', 'B', 'active', 'o1');
			INSERT INTO communityAddress (id, line1, country, state, city, postalCode, communityProfileId) VALUES ('ad', 'l', 'IN', 'GJ', 'X', '1', 'p');
		`);
		expect({ ...sqlite.prepare("SELECT version FROM communityProfile").get() }).toEqual({
			version: 0,
		});
		expect({ ...sqlite.prepare("SELECT version FROM communityAddress").get() }).toEqual({
			version: 0,
		});
	});
});
