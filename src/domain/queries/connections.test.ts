import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { freshDb } from "@/test/sqliteDb";
import { listConnections, removeMemberConnections, revokeConnection } from "./connections";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("connection queries", () => {
	let sqlite: DatabaseSync;
	let db: ReturnType<typeof freshDb>["db"];

	const consent = (id: string, clientId: string, userId: string, orgId: string, at: number) =>
		sqlite.exec(
			`INSERT INTO oauth_consent (id, client_id, user_id, reference_id, scopes, created_at, updated_at) VALUES ('${id}', '${clientId}', '${userId}', '${orgId}', 'community:read', ${at}, ${at})`
		);
	const refresh = (id: string, clientId: string, userId: string, orgId: string, at: number) =>
		sqlite.exec(
			`INSERT INTO oauth_refresh_token (id, token, client_id, user_id, reference_id, expires_at, created_at, scopes) VALUES ('${id}', 'tok-${id}', '${clientId}', '${userId}', '${orgId}', ${at + 30 * DAY}, ${at}, 'community:read offline_access')`
		);
	const live = (table: string) =>
		(
			sqlite.prepare(`SELECT id FROM ${table} WHERE revoked IS NULL ORDER BY id`).all() as {
				id: string;
			}[]
		).map((r) => r.id);
	const consentIds = () =>
		(sqlite.prepare("SELECT id FROM oauth_consent ORDER BY id").all() as { id: string }[]).map(
			(r) => r.id
		);

	beforeEach(() => {
		({ sqlite, db } = freshDb());
		sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
				('u1', 'U1', 'u1@x.test', 1, 0, 0), ('u2', 'U2', 'u2@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
			INSERT INTO oauth_client (id, client_id, name, uri, redirect_uris) VALUES
				('oc1', 'https://claude.ai/oauth/client.json', 'Claude', 'https://evil.test', '[]'),
				('oc2', 'dcr-abc', 'Cursor', 'https://cursor.com/app', '[]'),
				('oc3', 'dcr-nouri', NULL, NULL, '[]');
		`);
	});

	describe("listConnections", () => {
		it("lists only the caller's own Connections", async () => {
			consent("k1", "dcr-abc", "u1", "o1", NOW - 5 * DAY);
			consent("k2", "dcr-abc", "u2", "o1", NOW - 5 * DAY);
			const rows = await listConnections(db, "u1", NOW);
			expect(rows.map((r) => r.id)).toEqual(["k1"]);
		});

		it("joins client + org; host is the client_id host for CIMD, `uri` host for DCR", async () => {
			consent("k1", "https://claude.ai/oauth/client.json", "u1", "o1", NOW - 3 * DAY);
			consent("k2", "dcr-abc", "u1", "o2", NOW - 2 * DAY);
			consent("k3", "dcr-nouri", "u1", "o1", NOW - 1 * DAY);
			const rows = await listConnections(db, "u1", NOW);
			expect(rows).toMatchObject([
				{ id: "k3", clientName: "An app", host: null, orgId: "o1", orgName: "Org 1" },
				{ id: "k2", clientName: "Cursor", host: "cursor.com", orgId: "o2", orgName: "Org 2" },
				{ id: "k1", clientName: "Claude", host: "claude.ai", orgId: "o1" },
			]);
			expect(rows.map((r) => r.registration)).toEqual(["dcr", "dcr", "cimd"]);
		});

		it("last used = newest refresh token of that Connection only; Never when none was rotated", async () => {
			consent("k1", "dcr-abc", "u1", "o1", NOW - 20 * DAY);
			refresh("r1", "dcr-abc", "u1", "o1", NOW - 20 * DAY);
			refresh("r2", "dcr-abc", "u1", "o1", NOW - 6 * DAY);
			refresh("r3", "dcr-abc", "u1", "o1", NOW - 2 * DAY);
			// other org / client must not leak in
			refresh("r4", "dcr-abc", "u1", "o2", NOW - 1 * DAY);
			consent("k2", "dcr-nouri", "u1", "o1", NOW - 4 * DAY);
			refresh("r5", "dcr-nouri", "u1", "o1", NOW - 4 * DAY);
			const rows = await listConnections(db, "u1", NOW);
			const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
			expect(byId.k1.lastUsedAt).toBe(NOW - 2 * DAY);
			expect(byId.k1.status).toBe("active");
			expect(byId.k2.lastUsedAt).toBeNull();
			expect(byId.k1.connectedAt).toBe(NOW - 20 * DAY);
		});

		it("reconnect after revoke: older tokens don't count → Never", async () => {
			refresh("old1", "dcr-abc", "u1", "o1", NOW - 20 * DAY);
			refresh("old2", "dcr-abc", "u1", "o1", NOW - 10 * DAY);
			consent("k1", "dcr-abc", "u1", "o1", NOW - 1 * DAY);
			refresh("r1", "dcr-abc", "u1", "o1", NOW - 1 * DAY);
			const [row] = await listConnections(db, "u1", NOW);
			expect(row.lastUsedAt).toBeNull();
			expect(row.status).toBe("active");
		});

		it("Expired after 30d without a refresh", async () => {
			consent("k1", "dcr-abc", "u1", "o1", NOW - 90 * DAY);
			refresh("r1", "dcr-abc", "u1", "o1", NOW - 90 * DAY);
			refresh("r2", "dcr-abc", "u1", "o1", NOW - 31 * DAY);
			const [row] = await listConnections(db, "u1", NOW);
			expect(row.status).toBe("expired");
			expect(row.lastUsedAt).toBe(NOW - 31 * DAY);
		});
	});

	describe("revokeConnection", () => {
		beforeEach(() => {
			consent("k1", "dcr-abc", "u1", "o1", NOW - DAY);
			consent("k2", "dcr-abc", "u1", "o2", NOW - DAY);
			consent("k3", "dcr-nouri", "u1", "o1", NOW - DAY);
			consent("k4", "dcr-abc", "u2", "o1", NOW - DAY);
			refresh("r1", "dcr-abc", "u1", "o1", NOW - DAY);
			refresh("r2", "dcr-abc", "u1", "o2", NOW - DAY);
			refresh("r3", "dcr-nouri", "u1", "o1", NOW - DAY);
			refresh("r4", "dcr-abc", "u2", "o1", NOW - DAY);
			sqlite.exec(
				`INSERT INTO oauth_access_token (id, token, client_id, user_id, reference_id, expires_at, created_at, scopes) VALUES ('a1', 'at1', 'dcr-abc', 'u1', 'o1', ${NOW + DAY}, ${NOW}, 'community:read'), ('a2', 'at2', 'dcr-abc', 'u1', 'o2', ${NOW + DAY}, ${NOW}, 'community:read')`
			);
		});

		it("deletes the consent and revokes only its refresh + access tokens", async () => {
			const res = await revokeConnection(db, "u1", "k1", NOW);
			expect(res).toEqual({ clientId: "dcr-abc", orgId: "o1" });
			expect(consentIds()).toEqual(["k2", "k3", "k4"]);
			expect(live("oauth_refresh_token")).toEqual(["r2", "r3", "r4"]);
			expect(live("oauth_access_token")).toEqual(["a2"]);
		});

		it("someone else's Connection → null, nothing changes", async () => {
			await expect(revokeConnection(db, "u1", "k4", NOW)).resolves.toBeNull();
			await expect(revokeConnection(db, "u1", "nope", NOW)).resolves.toBeNull();
			expect(consentIds()).toEqual(["k1", "k2", "k3", "k4"]);
			expect(live("oauth_refresh_token")).toHaveLength(4);
		});

		it("keeps an earlier revoked timestamp (rotated tokens)", async () => {
			sqlite.exec("UPDATE oauth_refresh_token SET revoked = 5 WHERE id = 'r1'");
			await revokeConnection(db, "u1", "k1", NOW);
			const row = sqlite.prepare("SELECT revoked FROM oauth_refresh_token WHERE id = 'r1'").get();
			expect(row).toEqual({ revoked: 5 });
		});
	});

	describe("removeMemberConnections", () => {
		it("ends every Connection of that member in that org only", async () => {
			consent("k1", "dcr-abc", "u1", "o1", NOW - DAY);
			consent("k2", "dcr-nouri", "u1", "o1", NOW - DAY);
			consent("k3", "dcr-abc", "u1", "o2", NOW - DAY);
			consent("k4", "dcr-abc", "u2", "o1", NOW - DAY);
			refresh("r1", "dcr-abc", "u1", "o1", NOW - DAY);
			refresh("r2", "dcr-abc", "u1", "o2", NOW - DAY);
			refresh("r3", "dcr-abc", "u2", "o1", NOW - DAY);
			const ended = await removeMemberConnections(db, "u1", "o1", NOW);
			expect(ended).toEqual(
				expect.arrayContaining([
					{ clientId: "dcr-abc", orgId: "o1" },
					{ clientId: "dcr-nouri", orgId: "o1" },
				])
			);
			expect(ended).toHaveLength(2);
			expect(consentIds()).toEqual(["k3", "k4"]);
			expect(live("oauth_refresh_token")).toEqual(["r2", "r3"]);
		});

		it("no Connections → empty", async () => {
			await expect(removeMemberConnections(db, "u1", "o1", NOW)).resolves.toEqual([]);
		});
	});
});
