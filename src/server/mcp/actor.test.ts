import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "@/test/sqliteDb";
import { getActor, loadConnectionActor } from "./actor";

const KEY = { userId: "u1", clientId: "c1", orgId: "o1" };

describe("loadConnectionActor", () => {
	let sqlite: DatabaseSync;
	let db: ReturnType<typeof freshDb>["db"];

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
				('u1', 'U1', 'u1@x.test', 1, 0, 0), ('u2', 'U2', 'u2@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
			INSERT INTO oauth_client (id, client_id, redirect_uris) VALUES ('oc1', 'c1', '[]'), ('oc2', 'c2', '[]');
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m1', 'o1', 'u1', 'member', 0);
			INSERT INTO oauth_consent (id, client_id, user_id, reference_id, scopes) VALUES ('k1', 'c1', 'u1', 'o1', 'community:read');
		`);
	});

	it("member + consent → Actor with the member's role", async () => {
		await expect(loadConnectionActor(db, KEY)).resolves.toEqual({
			userId: "u1",
			organizationId: "o1",
			role: "member",
		});
	});

	it("no consent → null", async () => {
		sqlite.exec("DELETE FROM oauth_consent");
		await expect(loadConnectionActor(db, KEY)).resolves.toBeNull();
	});

	it("no membership (removed member) → null", async () => {
		sqlite.exec("DELETE FROM member");
		await expect(loadConnectionActor(db, KEY)).resolves.toBeNull();
	});

	it("role change → new role on the next call", async () => {
		sqlite.exec("UPDATE member SET role = 'admin'");
		await expect(loadConnectionActor(db, KEY)).resolves.toMatchObject({ role: "admin" });
		sqlite.exec("UPDATE member SET role = 'member,owner'");
		await expect(loadConnectionActor(db, KEY)).resolves.toMatchObject({ role: "owner" });
	});

	it("unknown role → null", async () => {
		sqlite.exec("UPDATE member SET role = 'superuser'");
		await expect(loadConnectionActor(db, KEY)).resolves.toBeNull();
	});

	it("consent for another client / org / user doesn't count", async () => {
		await expect(loadConnectionActor(db, { ...KEY, clientId: "c2" })).resolves.toBeNull();
		sqlite.exec(
			"INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m2', 'o2', 'u1', 'owner', 0)"
		);
		await expect(loadConnectionActor(db, { ...KEY, orgId: "o2" })).resolves.toBeNull();
		sqlite.exec(
			"INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ('m3', 'o1', 'u2', 'owner', 0)"
		);
		await expect(loadConnectionActor(db, { ...KEY, userId: "u2" })).resolves.toBeNull();
	});
});

describe("getActor", () => {
	it("reads authInfo.extra.actor", () => {
		const actor = { userId: "u", organizationId: "o", role: "member" as const };
		const ctx = { http: { authInfo: { token: "t", clientId: "c", scopes: [], extra: { actor } } } };
		expect(getActor(ctx as never)).toBe(actor);
	});
	it("throws without one", () => {
		expect(() => getActor({ http: undefined })).toThrow();
	});
});
