import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionActor } from "../actor";

const h = vi.hoisted(() => ({ fresh: undefined as unknown as { sqlite: any; db: any } }));

vi.mock("@/db", async () => {
	const { freshDb } = await import("@/test/sqliteDb");
	h.fresh = freshDb();
	return { db: h.fresh.db };
});
vi.mock("@/lib/posthog-server", () => ({ captureMcpToolCalled: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { KV: {} } }));

const { createKutumbMcpHandler } = await import("../server");
const { makeProfileChanges } = await import("@/domain/profileChanges");
const { captureMcpToolCalled } = await import("@/lib/posthog-server");

const WRITE = { canWrite: true } as const;
const actorOf = (userId: string, role: ConnectionActor["role"]): ConnectionActor => ({
	userId,
	organizationId: "o1",
	role,
	write: WRITE,
});
const OWNER = actorOf("u-owner", "owner");
const ADMIN = actorOf("u-admin", "admin");
const MEMBER = actorOf("u-member", "member");

const burst = { limit: vi.fn(async (_: { key: string }) => ({ success: true })) };
let now = 1_000_000_000_000;
let ids = 0;

const handler = () =>
	createKutumbMcpHandler({
		burst,
		now: () => now,
		changesFor: (via) =>
			makeProfileChanges({
				db: h.fresh.db,
				limits: { assertProfileSlot: async () => {} },
				via,
				now: () => new Date(now),
				newId: () => `id${++ids}`,
			}),
		quotaLimits: { daily: 6, create: 3 },
	});

async function rpc(method: string, params: unknown, actor: ConnectionActor = OWNER) {
	const res = await handler().fetch(
		new Request("https://kutumb.example.org/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		}),
		{
			authInfo: {
				token: "t",
				clientId: "c1",
				scopes: ["community:read", "community:write"],
				extra: { actor },
			},
		}
	);
	const text = await res.text();
	const data = /^(event|data):/.test(text)
		? text
				.split("\n")
				.find((l) => l.startsWith("data:"))!
				.slice(5)
		: text;
	return JSON.parse(data);
}

const call = async (name: string, args: unknown, actor?: ConnectionActor) =>
	(await rpc("tools/call", { name, arguments: args }, actor)).result;
const sql = (q: string) => h.fresh.sqlite.exec(q);
const rows = (q: string) => h.fresh.sqlite.prepare(q).all() as Record<string, any>[];
/** `customFieldData` is a BLOB of JSON text. */
const cfd = (v: unknown) =>
	v === null ? null : JSON.parse(Buffer.from(v as Uint8Array).toString());
const textOf = (result: any) => result.content[0].text as string;

beforeEach(() => {
	vi.clearAllMocks();
	burst.limit.mockResolvedValue({ success: true });
	now = 1_000_000_000_000;
	sql(`
		DELETE FROM auditEvent; DELETE FROM changeRequest; DELETE FROM communityRelation;
		DELETE FROM communityAddress; DELETE FROM communityProfile; DELETE FROM communityProfileCustomField;
		DELETE FROM oauth_client; DELETE FROM member; DELETE FROM organization; DELETE FROM user;
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
			('u-owner', 'Olga Owner', 'o@x.test', 1, 0, 0), ('u-admin', 'Adi Admin', 'a@x.test', 1, 0, 0),
			('u-member', 'Mira Member', 'm@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
		INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
			('m1', 'o1', 'u-owner', 'owner', 0), ('m2', 'o1', 'u-admin', 'admin', 0), ('m3', 'o1', 'u-member', 'member', 0);
		INSERT INTO oauth_client (id, client_id, name, redirect_uris) VALUES ('oc1', 'c1', 'Claude', '[]');
		INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES
			('f1', 'Gotra', 'text', 'o1'), ('f2', 'Height', 'number', 'o1');
		INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, version, dateOfBirth) VALUES
			('p1', 'Asha', 'Patel', 'active', 'o1', 0, '1990-01-02T00:00:00.000Z'),
			('p2', 'Ravi', 'Shah', 'active', 'o1', 3, NULL);
		INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, version, userId) VALUES
			('mine', 'Mira', 'Member', 'active', 'o1', 0, 'u-member');
	`);
});

describe("tools/list for a writable Connection", () => {
	it("offers create_profile and update_profile with write annotations", async () => {
		const { result } = await rpc("tools/list", {});
		const byName = Object.fromEntries(result.tools.map((t: any) => [t.name, t]));
		expect(byName.create_profile.annotations).toEqual({
			readOnlyHint: false,
			openWorldHint: false,
			destructiveHint: false,
			idempotentHint: false,
		});
		expect(byName.update_profile.annotations).toEqual({
			readOnlyHint: false,
			openWorldHint: false,
			destructiveHint: true,
			idempotentHint: true,
		});
		expect(byName.create_profile.description).toContain("search_profiles");
	});
});

describe("create_profile", () => {
	it("owner → applied, attributed to the client, version 0", async () => {
		const result = await call("create_profile", {
			firstName: "Nina",
			lastName: "Desai",
			dateOfBirth: "1985-03-04",
			customFields: [{ field: "gotra", value: "Bharadwaj" }],
		});
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			version: 0,
			profileId: expect.any(String),
			message: expect.any(String),
		});
		const [created] = rows(`SELECT * FROM communityProfile WHERE firstName = 'Nina'`);
		expect(created).toMatchObject({ dateOfBirth: "1985-03-04T00:00:00.000Z", status: "active" });
		expect(cfd(created!.customFieldData)).toEqual({ f1: "Bharadwaj" });
		expect(rows(`SELECT viaClientId, viaClientName, actorUserId FROM auditEvent`)).toEqual([
			{ viaClientId: "c1", viaClientName: "Claude", actorUserId: "u-owner" },
		]);
		expect(captureMcpToolCalled).toHaveBeenCalledWith(
			expect.objectContaining({ tool: "create_profile", outcome: "applied", isError: false })
		);
	});

	it("member → requested, never isError, visible to the member as their pending draft", async () => {
		const result = await call("create_profile", { firstName: "Nina", lastName: "Desai" }, MEMBER);
		expect(result.isError).toBeUndefined();
		const out = result.structuredContent;
		expect(out).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
			message: expect.stringContaining("review"),
		});
		expect(out).not.toHaveProperty("version");

		const got = (await call("get_profile", { id: out.profileId }, MEMBER)).structuredContent;
		expect(got).toMatchObject({ status: "draft" });
		expect(got.myPendingRequests).toMatchObject([{ id: out.changeRequestId, kind: "create" }]);
		expect(rows(`SELECT viaClientId FROM changeRequest`)).toEqual([{ viaClientId: "c1" }]);
	});

	it("self creates the member's own linked profile, active at once", async () => {
		sql(`DELETE FROM communityProfile WHERE id = 'mine'`);
		const result = await call(
			"create_profile",
			{ firstName: "Mira", lastName: "Member", self: true },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({ outcome: "applied" });
		expect(rows(`SELECT userId, status FROM communityProfile WHERE firstName = 'Mira'`)).toEqual([
			{ userId: "u-member", status: "active" },
		]);
	});

	it("Invalid input → isError naming the problem and the valid fields", async () => {
		const unknown = await call("create_profile", {
			firstName: "A",
			lastName: "B",
			customFields: [{ field: "Hobby", value: "x" }],
		});
		expect(unknown.isError).toBe(true);
		expect(textOf(unknown)).toContain("Height (id f2, number)");
		const mismatch = await call("create_profile", {
			firstName: "A",
			lastName: "B",
			customFields: [{ field: "Height", value: "tall" }],
		});
		expect(textOf(mismatch)).toContain("number");
		expect(rows(`SELECT id FROM communityProfile`)).toHaveLength(3);
	});

	describe("duplicate detection", () => {
		it("same name (trimmed, any case) → possible_duplicate, nothing written, ≤5 candidates", async () => {
			const before = rows(`SELECT id FROM communityProfile`).length;
			const result = await call("create_profile", { firstName: " asha ", lastName: "PATEL" });
			expect(result.isError).toBeUndefined();
			expect(result.structuredContent).toEqual({
				outcome: "possible_duplicate",
				candidates: [{ id: "p1", name: "Asha Patel", dateOfBirth: "1990-01-02", status: "active" }],
				message: expect.stringContaining("allowDuplicate"),
			});
			expect(rows(`SELECT id FROM communityProfile`)).toHaveLength(before);
			expect(rows(`SELECT id FROM auditEvent`)).toEqual([]);
		});

		it("caps candidates at 5", async () => {
			for (let i = 0; i < 7; i++) {
				sql(
					`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES ('d${i}', 'Dup', 'Lic', 'active', 'o1')`
				);
			}
			const out = (await call("create_profile", { firstName: "Dup", lastName: "Lic" }))
				.structuredContent;
			expect(out.candidates).toHaveLength(5);
		});

		it("both DOBs set and different → not a match", async () => {
			const result = await call("create_profile", {
				firstName: "Asha",
				lastName: "Patel",
				dateOfBirth: "2001-05-06",
			});
			expect(result.structuredContent.outcome).toBe("applied");
		});

		it("one DOB missing still matches", async () => {
			const result = await call("create_profile", {
				firstName: "Ravi",
				lastName: "Shah",
				dateOfBirth: "1970-01-01",
			});
			expect(result.structuredContent.outcome).toBe("possible_duplicate");
		});

		it("allowDuplicate: true forces the create", async () => {
			const result = await call("create_profile", {
				firstName: "Asha",
				lastName: "Patel",
				allowDuplicate: true,
			});
			expect(result.structuredContent.outcome).toBe("applied");
		});

		it("only profiles the AI client can read count (another's draft / inactive do not)", async () => {
			sql(`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId) VALUES
				('dr', 'Hidden', 'Draft', 'draft', 'o1'), ('in', 'Hidden', 'Gone', 'inactive', 'o1')`);
			for (const lastName of ["Draft", "Gone"]) {
				const r = await call("create_profile", { firstName: "Hidden", lastName });
				expect(r.structuredContent.outcome).toBe("applied");
			}
		});
	});
});

describe("update_profile", () => {
	it("owner on a userless profile → applied with the new version", async () => {
		const result = await call("update_profile", {
			profileId: "p2",
			expectedVersion: 3,
			nickName: "Ravu",
			dateOfDeath: "2020-02-02",
			customFields: [{ field: "Height", value: 171 }],
		});
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p2",
			version: 4,
		});
		const [p] = rows(`SELECT * FROM communityProfile WHERE id = 'p2'`);
		expect(p).toMatchObject({
			nickName: "Ravu",
			dateOfDeath: "2020-02-02T00:00:00.000Z",
			firstName: "Ravi",
			version: 4,
		});
		expect(cfd(p!.customFieldData)).toEqual({ f2: 171 });
	});

	it("member on a userless profile → requested, listed in myPendingRequests", async () => {
		const result = await call(
			"update_profile",
			{ profileId: "p2", expectedVersion: 3, nickName: "Ravu" },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({
			outcome: "requested",
			profileId: "p2",
			changeRequestId: expect.any(String),
		});
		expect(rows(`SELECT nickName FROM communityProfile WHERE id = 'p2'`)).toEqual([
			{ nickName: null },
		]);
		const got = (await call("get_profile", { id: "p2" }, MEMBER)).structuredContent;
		expect(got.myPendingRequests).toMatchObject([
			{ id: result.structuredContent.changeRequestId, kind: "info" },
		]);
		expect(rows(`SELECT viaClientName FROM changeRequest`)).toEqual([{ viaClientName: "Claude" }]);
	});

	it("member on their own linked profile → applied", async () => {
		const result = await call(
			"update_profile",
			{ profileId: "mine", expectedVersion: 0, mobileNumber: "+91 1" },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({ outcome: "applied", version: 1 });
	});

	it("repeating the same patch → unchanged (idempotent), not counted", async () => {
		const patch = { profileId: "p2", expectedVersion: 3, nickName: "Ravu" };
		await call("update_profile", patch);
		const again = await call("update_profile", { ...patch, expectedVersion: 4 });
		expect(again.isError).toBeUndefined();
		expect(again.structuredContent).toMatchObject({ outcome: "unchanged", profileId: "p2" });
		expect(rows(`SELECT id FROM auditEvent`)).toHaveLength(1);
	});

	it("stale expectedVersion → isError Stale with a re-read hint, nothing written", async () => {
		const result = await call("update_profile", {
			profileId: "p2",
			expectedVersion: 1,
			nickName: "Ravu",
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("Stale");
		expect(textOf(result)).toContain("get_profile");
		expect(rows(`SELECT id FROM auditEvent`)).toEqual([]);
	});

	it("null clears; absent keeps; clearing a required name is Invalid", async () => {
		await call("update_profile", { profileId: "p1", expectedVersion: 0, dateOfBirth: null });
		expect(rows(`SELECT dateOfBirth, firstName FROM communityProfile WHERE id = 'p1'`)).toEqual([
			{ dateOfBirth: null, firstName: "Asha" },
		]);
		const bad = await call("update_profile", {
			profileId: "p1",
			expectedVersion: 1,
			firstName: " ",
		});
		expect(bad.isError).toBe(true);
		expect(textOf(bad)).toContain("firstName");
	});

	it("customFields: strict types and unknown fields are Invalid; null clears a value", async () => {
		const bad = await call("update_profile", {
			profileId: "p1",
			expectedVersion: 0,
			customFields: [{ field: "Height", value: "tall" }],
		});
		expect(bad.isError).toBe(true);
		await call("update_profile", {
			profileId: "p1",
			expectedVersion: 0,
			customFields: [{ field: "Gotra", value: "K" }],
		});
		await call("update_profile", {
			profileId: "p1",
			expectedVersion: 1,
			customFields: [{ field: "f1", value: null }],
		});
		const [p] = rows(`SELECT customFieldData FROM communityProfile WHERE id = 'p1'`);
		expect(Object.keys(cfd(p!.customFieldData) ?? {})).toEqual([]);
	});

	it("another member's linked profile → Forbidden message, not an internal error", async () => {
		sql(`UPDATE communityProfile SET userId = 'u-admin' WHERE id = 'p2'`);
		const result = await call(
			"update_profile",
			{ profileId: "p2", expectedVersion: 3, nickName: "x" },
			MEMBER
		);
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("linked user");
	});

	it("unknown profile → not found", async () => {
		const result = await call("update_profile", {
			profileId: "nope",
			expectedVersion: 0,
			nickName: "x",
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("not found");
	});
});

describe("write quotas", () => {
	it("burst limiter: a denied call is an isError tool result (not HTTP 429), nothing written", async () => {
		burst.limit.mockResolvedValue({ success: false });
		const result = await call("create_profile", { firstName: "Nina", lastName: "Desai" });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("Write quota reached, resets in ~1 min");
		expect(burst.limit).toHaveBeenCalledWith({ key: "c1:u-owner:o1" });
		expect(rows(`SELECT id FROM auditEvent`)).toEqual([]);
	});

	it("burst counts every call, including ones that fail or change nothing", async () => {
		await call("create_profile", {
			firstName: "A",
			lastName: "B",
			customFields: [{ field: "x", value: 1 }],
		});
		await call("update_profile", { profileId: "p1", expectedVersion: 0 });
		expect(burst.limit).toHaveBeenCalledTimes(2);
	});

	it("daily quota: blocks once the pool is full, says when it resets", async () => {
		for (let i = 0; i < 6; i++) {
			const r = await call("update_profile", {
				profileId: "p2",
				expectedVersion: 3 + i,
				nickName: `n${i}`,
			});
			expect(r.structuredContent.outcome, `call ${i}`).toBe("applied");
			now += 1000;
		}
		now += 60_000;
		const blocked = await call("update_profile", {
			profileId: "p2",
			expectedVersion: 9,
			nickName: "z",
		});
		expect(blocked.isError).toBe(true);
		expect(textOf(blocked)).toMatch(/Write quota reached, resets in ~\d+ min/);
		expect(rows(`SELECT nickName FROM communityProfile WHERE id = 'p2'`)).toEqual([
			{ nickName: "n5" },
		]);

		// A day later the window has moved on.
		now += 24 * 60 * 60 * 1000;
		const ok = await call("update_profile", { profileId: "p2", expectedVersion: 9, nickName: "z" });
		expect(ok.structuredContent.outcome).toBe("applied");
	});

	it("create sub-cap: creates stop at the cap while other writes still pass", async () => {
		for (let i = 0; i < 3; i++) {
			await call("create_profile", { firstName: `C${i}`, lastName: "Q" });
			now += 1000;
		}
		const blocked = await call("create_profile", { firstName: "C9", lastName: "Q" });
		expect(blocked.isError).toBe(true);
		expect(textOf(blocked)).toContain("Write quota reached");
		const other = await call("update_profile", {
			profileId: "p2",
			expectedVersion: 3,
			nickName: "z",
		});
		expect(other.structuredContent.outcome).toBe("applied");
	});

	it("unchanged, possible_duplicate and errors do not eat the quota", async () => {
		for (let i = 0; i < 10; i++) {
			await call("update_profile", { profileId: "p2", expectedVersion: 3 }); // unchanged
			await call("create_profile", { firstName: "Asha", lastName: "Patel" }); // possible_duplicate
			await call("update_profile", { profileId: "p2", expectedVersion: 99, nickName: "x" }); // Stale
			now += 1000;
		}
		const ok = await call("create_profile", { firstName: "Fresh", lastName: "Q" });
		expect(ok.structuredContent.outcome).toBe("applied");
	});

	it("other Connections / members have their own quota", async () => {
		for (let i = 0; i < 3; i++) await call("create_profile", { firstName: `N${i}`, lastName: "Q" });
		for (let i = 0; i < 3; i++) {
			await call("update_profile", { profileId: "p2", expectedVersion: 3 + i, nickName: `n${i}` });
		}
		expect((await call("create_profile", { firstName: "X", lastName: "Q" })).isError).toBe(true);
		const admin = await call("create_profile", { firstName: "Other", lastName: "Q" }, ADMIN);
		expect(admin.structuredContent.outcome).toBe("applied");
	});
});

describe("PENDING_REQUEST_LIMIT through the tool", () => {
	it("LimitReached → isError with a tell-the-user hint", async () => {
		const values = Array.from(
			{ length: 50 },
			(_, i) => `('pr${i}', 'o1', 'p2', 'Ravi Shah', 'info', 'pending', 'u-member', 'M', 0)`
		).join(",");
		sql(
			`INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt) VALUES ${values}`
		);
		const result = await call(
			"update_profile",
			{ profileId: "p2", expectedVersion: 3, nickName: "Ravu" },
			MEMBER
		);
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("LimitReached");
		expect(textOf(result).toLowerCase()).toContain("tell the user");
	});
});

describe("relation and address tools in tools/list", () => {
	it("are offered with the spec annotations", async () => {
		const { result } = await rpc("tools/list", {});
		const byName = Object.fromEntries(result.tools.map((t: any) => [t.name, t]));
		const flags = (destructive: boolean, idempotent: boolean) => ({
			readOnlyHint: false,
			openWorldHint: false,
			destructiveHint: destructive,
			idempotentHint: idempotent,
		});
		expect(byName.add_relation.annotations).toEqual(flags(false, false));
		expect(byName.remove_relation.annotations).toEqual(flags(true, true));
		expect(byName.add_address.annotations).toEqual(flags(false, false));
		expect(byName.update_address.annotations).toEqual(flags(true, true));
		expect(byName.remove_address.annotations).toEqual(flags(true, true));
		expect(byName.add_relation.description).toContain("outgoing");
		expect(byName.add_relation.description).toContain("Worked example");
	});
});

describe("add_relation", () => {
	beforeEach(() => {
		sql(`
			INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, version) VALUES
				('p3', 'Zoya', 'Khan', 'active', 'o1', 0), ('dr', 'Dina', 'Draft', 'draft', 'o1', 0);
		`);
	});

	it("owner → applied: 'toId is profileId's <type>' stored outgoing, with the relation id", async () => {
		const result = await call("add_relation", {
			profileId: "p1",
			toId: "p2",
			type: "father",
			bloodRelation: true,
			note: "step",
		});
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p1",
			relationId: expect.any(String),
		});
		expect(
			rows(`SELECT id, fromId, toId, type, bloodRelation, note FROM communityRelation`)
		).toEqual([
			{
				id: result.structuredContent.relationId,
				fromId: "p1",
				toId: "p2",
				type: "father",
				bloodRelation: 1,
				note: "step",
			},
		]);
		expect(rows(`SELECT action, viaClientId FROM auditEvent`)).toEqual([
			{ action: "relation.added", viaClientId: "c1" },
		]);
		const got = (await call("get_profile", { id: "p1" })).structuredContent;
		expect(got.outgoing).toMatchObject([
			{ id: result.structuredContent.relationId, type: "father", counterpart: { id: "p2" } },
		]);
	});

	it("member on a userless profile → requested, nothing written, listed in myPendingRequests", async () => {
		const result = await call(
			"add_relation",
			{ profileId: "p1", toId: "p2", type: "uncle" },
			MEMBER
		);
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
		});
		expect(result.structuredContent).not.toHaveProperty("relationId");
		expect(rows(`SELECT id FROM communityRelation`)).toEqual([]);
		const got = (await call("get_profile", { id: "p1" }, MEMBER)).structuredContent;
		expect(got.myPendingRequests).toMatchObject([
			{ id: result.structuredContent.changeRequestId, kind: "relation_add" },
		]);
		expect(rows(`SELECT viaClientName FROM changeRequest`)).toEqual([{ viaClientName: "Claude" }]);
	});

	it("member on their own linked profile → applied", async () => {
		const result = await call(
			"add_relation",
			{ profileId: "mine", toId: "p1", type: "mother" },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({ outcome: "applied", profileId: "mine" });
	});

	it("exact repeat (same toId + type) → unchanged with the existing id, nothing written", async () => {
		const first = await call("add_relation", { profileId: "p1", toId: "p2", type: "father" });
		const again = await call("add_relation", {
			profileId: "p1",
			toId: "p2",
			type: "father",
			bloodRelation: true,
			note: "different note",
		});
		expect(again.isError).toBeUndefined();
		expect(again.structuredContent).toMatchObject({
			outcome: "unchanged",
			profileId: "p1",
			relationId: first.structuredContent.relationId,
		});
		expect(rows(`SELECT id FROM communityRelation`)).toHaveLength(1);
		expect(rows(`SELECT id FROM auditEvent`)).toHaveLength(1);
		// Same for a role that would otherwise only be able to request.
		const asMember = await call(
			"add_relation",
			{ profileId: "p1", toId: "p2", type: "father" },
			MEMBER
		);
		expect(asMember.structuredContent).toMatchObject({
			outcome: "unchanged",
			relationId: first.structuredContent.relationId,
		});
		expect(rows(`SELECT id FROM changeRequest`)).toEqual([]);
	});

	it("other type for the same pair → Invalid naming the existing relation", async () => {
		const first = await call("add_relation", { profileId: "p1", toId: "p2", type: "father" });
		const other = await call("add_relation", { profileId: "p1", toId: "p2", type: "uncle" });
		expect(other.isError).toBe(true);
		expect(textOf(other)).toContain("father");
		expect(textOf(other)).toContain(first.structuredContent.relationId);
		expect(textOf(other)).toContain("remove_relation");
		expect(rows(`SELECT id FROM communityRelation`)).toHaveLength(1);
	});

	it("the reverse direction of an existing pair → Invalid (seam rule), nothing written", async () => {
		await call("add_relation", { profileId: "p1", toId: "p2", type: "father" });
		const reverse = await call("add_relation", { profileId: "p2", toId: "p1", type: "child" });
		expect(reverse.isError).toBe(true);
		expect(textOf(reverse)).toContain("already exists");
		expect(rows(`SELECT id FROM communityRelation`)).toHaveLength(1);
	});

	it("self, unknown, draft target and unknown type are errors the model can act on", async () => {
		const self = await call("add_relation", { profileId: "p1", toId: "p1", type: "brother" });
		expect(self.isError).toBe(true);
		expect(textOf(self)).toContain("itself");
		const unknown = await call("add_relation", { profileId: "p1", toId: "nope", type: "brother" });
		expect(textOf(unknown)).toContain("not found");
		const draft = await call("add_relation", { profileId: "p1", toId: "dr", type: "brother" });
		expect(textOf(draft)).toContain("not found");
		const badType = await rpc("tools/call", {
			name: "add_relation",
			arguments: { profileId: "p1", toId: "p2", type: "cousin" },
		});
		expect(badType.result?.isError ?? !!badType.error).toBe(true);
		expect(rows(`SELECT id FROM communityRelation`)).toEqual([]);
	});

	it("a profile the client cannot read is not found", async () => {
		const result = await call("add_relation", { profileId: "dr", toId: "p1", type: "brother" });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("not found");
	});
});

describe("remove_relation", () => {
	beforeEach(() => {
		sql(`
			INSERT INTO communityRelation (id, fromId, toId, organizationId, type, bloodRelation) VALUES
				('r1', 'p1', 'p2', 'o1', 'father', 0);
		`);
	});

	it("owner removes an outgoing relation → applied with its id", async () => {
		const result = await call("remove_relation", { profileId: "p1", relationId: "r1" });
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p1",
			relationId: "r1",
		});
		expect(rows(`SELECT id FROM communityRelation`)).toEqual([]);
		expect(rows(`SELECT action, viaClientId FROM auditEvent`)).toEqual([
			{ action: "relation.removed", viaClientId: "c1" },
		]);
	});

	it("member on a userless profile → requested, relation stays", async () => {
		const result = await call("remove_relation", { profileId: "p1", relationId: "r1" }, MEMBER);
		expect(result.structuredContent).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
		});
		expect(rows(`SELECT id FROM communityRelation`)).toHaveLength(1);
		const got = (await call("get_profile", { id: "p1" }, MEMBER)).structuredContent;
		expect(got.myPendingRequests).toMatchObject([{ kind: "relation_remove" }]);
	});

	it("an incoming relation id → Invalid hint pointing at the other profile", async () => {
		const result = await call("remove_relation", { profileId: "p2", relationId: "r1" });
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("incoming");
		expect(textOf(result)).toContain("outgoing");
		expect(textOf(result)).toContain("p1");
		expect(rows(`SELECT id FROM communityRelation`)).toHaveLength(1);
		expect(rows(`SELECT id FROM auditEvent`)).toEqual([]);
	});

	it("unknown relation, or one of another profile → not found", async () => {
		const unknown = await call("remove_relation", { profileId: "p1", relationId: "zzz" });
		expect(unknown.isError).toBe(true);
		expect(textOf(unknown)).toContain("not found");
		sql(
			`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, version) VALUES ('p3', 'Zoya', 'Khan', 'active', 'o1', 0)`
		);
		const other = await call("remove_relation", { profileId: "p3", relationId: "r1" });
		expect(textOf(other)).toContain("not found");
	});
});

describe("add_address", () => {
	const ADDRESS = {
		profileId: "p2",
		line1: "12 Park Street",
		city: "Surat",
		state: "Gujarat",
		country: "India",
		postalCode: "395001",
	};

	it("owner → applied with addressId and version 0; optional fields stored", async () => {
		const result = await call("add_address", {
			...ADDRESS,
			line2: "Flat 4",
			type: "work",
			note: "office",
			digipin: "39J-49L-L8T4",
		});
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p2",
			addressId: expect.any(String),
			version: 0,
		});
		expect(
			rows(
				`SELECT id, line1, line2, city, state, country, postalCode, type, note, digipin, communityProfileId FROM communityAddress`
			)
		).toEqual([
			{
				id: result.structuredContent.addressId,
				line1: "12 Park Street",
				line2: "Flat 4",
				city: "Surat",
				state: "Gujarat",
				country: "India",
				postalCode: "395001",
				type: "work",
				note: "office",
				digipin: "39J-49L-L8T4",
				communityProfileId: "p2",
			},
		]);
		expect(rows(`SELECT action, viaClientId FROM auditEvent`)).toEqual([
			{ action: "address.added", viaClientId: "c1" },
		]);
		const got = (await call("get_profile", { id: "p2" })).structuredContent;
		expect(got.addresses).toMatchObject([
			{ id: result.structuredContent.addressId, version: 0, line1: "12 Park Street" },
		]);
	});

	it("member on a userless profile → requested; on their own profile → applied", async () => {
		const requested = await call("add_address", ADDRESS, MEMBER);
		expect(requested.structuredContent).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
		});
		expect(requested.structuredContent).not.toHaveProperty("addressId");
		expect(rows(`SELECT id FROM communityAddress`)).toEqual([]);
		const got = (await call("get_profile", { id: "p2" }, MEMBER)).structuredContent;
		expect(got.myPendingRequests).toMatchObject([{ kind: "address_add" }]);

		const own = await call("add_address", { ...ADDRESS, profileId: "mine" }, MEMBER);
		expect(own.structuredContent).toMatchObject({ outcome: "applied", profileId: "mine" });
	});

	it("repeat on normalised line1+city+postalCode → unchanged with the existing id + version", async () => {
		const first = await call("add_address", ADDRESS);
		const again = await call("add_address", {
			...ADDRESS,
			line1: "  12   PARK street ",
			city: "surat",
			postalCode: " 395001 ",
			note: "other note",
		});
		expect(again.isError).toBeUndefined();
		expect(again.structuredContent).toMatchObject({
			outcome: "unchanged",
			profileId: "p2",
			addressId: first.structuredContent.addressId,
			version: 0,
		});
		expect(rows(`SELECT id FROM communityAddress`)).toHaveLength(1);
		expect(rows(`SELECT id FROM auditEvent`)).toHaveLength(1);
		// A different postal code is a different address.
		const other = await call("add_address", { ...ADDRESS, postalCode: "395002" });
		expect(other.structuredContent.outcome).toBe("applied");
		expect(rows(`SELECT id FROM communityAddress`)).toHaveLength(2);
	});

	it("same address on another profile is not a repeat", async () => {
		await call("add_address", ADDRESS);
		const other = await call("add_address", { ...ADDRESS, profileId: "p1" });
		expect(other.structuredContent.outcome).toBe("applied");
	});

	it("blank required fields are Invalid naming the field; unknown profile is not found", async () => {
		const blank = await call("add_address", { ...ADDRESS, city: "   " });
		expect(blank.isError).toBe(true);
		expect(textOf(blank)).toContain("City");
		const missing = await call("add_address", { ...ADDRESS, profileId: "nope" });
		expect(textOf(missing)).toContain("not found");
		expect(rows(`SELECT id FROM communityAddress`)).toEqual([]);
	});
});

describe("update_address", () => {
	beforeEach(() => {
		sql(`
			INSERT INTO communityAddress (id, line1, line2, country, state, city, postalCode, type, note, communityProfileId, version) VALUES
				('a1', '12 Park Street', 'Flat 4', 'India', 'Gujarat', 'Surat', '395001', 'home', 'old', 'p2', 2);
		`);
	});

	it("owner patch → applied with the new version; absent keeps, null clears", async () => {
		const result = await call("update_address", {
			profileId: "p2",
			addressId: "a1",
			expectedVersion: 2,
			city: "Vadodara",
			line2: null,
		});
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p2",
			addressId: "a1",
			version: 3,
		});
		expect(rows(`SELECT line1, line2, city, note, type, version FROM communityAddress`)).toEqual([
			{
				line1: "12 Park Street",
				line2: null,
				city: "Vadodara",
				note: "old",
				type: "home",
				version: 3,
			},
		]);
		expect(rows(`SELECT action, viaClientId FROM auditEvent`)).toEqual([
			{ action: "address.updated", viaClientId: "c1" },
		]);
	});

	it("member on a userless profile → requested, row untouched", async () => {
		const result = await call(
			"update_address",
			{ profileId: "p2", addressId: "a1", expectedVersion: 2, city: "Vadodara" },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
		});
		expect(rows(`SELECT city, version FROM communityAddress`)).toEqual([
			{ city: "Surat", version: 2 },
		]);
		const got = (await call("get_profile", { id: "p2" }, MEMBER)).structuredContent;
		expect(got.myPendingRequests).toMatchObject([{ kind: "address_edit" }]);
	});

	it("member on their own linked profile → applied", async () => {
		sql(`
			INSERT INTO communityAddress (id, line1, country, state, city, postalCode, communityProfileId, version)
			VALUES ('a2', '1 Lane', 'India', 'Gujarat', 'Surat', '395001', 'mine', 0);
		`);
		const result = await call(
			"update_address",
			{ profileId: "mine", addressId: "a2", expectedVersion: 0, note: "hi" },
			MEMBER
		);
		expect(result.structuredContent).toMatchObject({ outcome: "applied", version: 1 });
	});

	it("repeating the same patch → unchanged (idempotent), not counted", async () => {
		const patch = { profileId: "p2", addressId: "a1", expectedVersion: 2, city: "Vadodara" };
		await call("update_address", patch);
		const again = await call("update_address", { ...patch, expectedVersion: 3 });
		expect(again.isError).toBeUndefined();
		expect(again.structuredContent).toMatchObject({
			outcome: "unchanged",
			profileId: "p2",
			addressId: "a1",
			version: 3,
		});
		expect(rows(`SELECT id FROM auditEvent`)).toHaveLength(1);
	});

	it("stale expectedVersion → Stale with a re-read hint, nothing written", async () => {
		const result = await call("update_address", {
			profileId: "p2",
			addressId: "a1",
			expectedVersion: 1,
			city: "Vadodara",
		});
		expect(result.isError).toBe(true);
		expect(textOf(result)).toContain("Stale");
		expect(textOf(result)).toContain("get_profile");
		expect(rows(`SELECT city FROM communityAddress`)).toEqual([{ city: "Surat" }]);
	});

	it("a required field cannot be cleared or blanked (Invalid); unknown / foreign address is not found", async () => {
		const cleared = await rpc("tools/call", {
			name: "update_address",
			arguments: { profileId: "p2", addressId: "a1", expectedVersion: 2, city: null },
		});
		expect(cleared.result?.isError ?? !!cleared.error).toBe(true);
		const blank = await call("update_address", {
			profileId: "p2",
			addressId: "a1",
			expectedVersion: 2,
			city: "  ",
		});
		expect(blank.isError).toBe(true);
		expect(textOf(blank)).toContain("City");
		const unknown = await call("update_address", {
			profileId: "p2",
			addressId: "nope",
			expectedVersion: 2,
			city: "X",
		});
		expect(textOf(unknown)).toContain("not found");
		const foreign = await call("update_address", {
			profileId: "p1",
			addressId: "a1",
			expectedVersion: 2,
			city: "X",
		});
		expect(textOf(foreign)).toContain("not found");
		expect(rows(`SELECT city FROM communityAddress`)).toEqual([{ city: "Surat" }]);
	});
});

describe("remove_address", () => {
	beforeEach(() => {
		sql(`
			INSERT INTO communityAddress (id, line1, country, state, city, postalCode, communityProfileId, version)
			VALUES ('a1', '12 Park Street', 'India', 'Gujarat', 'Surat', '395001', 'p2', 2);
		`);
	});

	it("owner → applied with the address id", async () => {
		const result = await call("remove_address", { profileId: "p2", addressId: "a1" });
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent).toMatchObject({
			outcome: "applied",
			profileId: "p2",
			addressId: "a1",
		});
		expect(rows(`SELECT id FROM communityAddress`)).toEqual([]);
		expect(rows(`SELECT action, viaClientId FROM auditEvent`)).toEqual([
			{ action: "address.removed", viaClientId: "c1" },
		]);
	});

	it("member on a userless profile → requested, address stays", async () => {
		const result = await call("remove_address", { profileId: "p2", addressId: "a1" }, MEMBER);
		expect(result.structuredContent).toMatchObject({
			outcome: "requested",
			changeRequestId: expect.any(String),
		});
		expect(rows(`SELECT id FROM communityAddress`)).toHaveLength(1);
	});

	it("unknown address or one of another profile → not found", async () => {
		const unknown = await call("remove_address", { profileId: "p2", addressId: "nope" });
		expect(unknown.isError).toBe(true);
		expect(textOf(unknown)).toContain("not found");
		const foreign = await call("remove_address", { profileId: "p1", addressId: "a1" });
		expect(textOf(foreign)).toContain("not found");
		expect(rows(`SELECT id FROM communityAddress`)).toHaveLength(1);
	});
});

describe("write quotas for relation and address tools", () => {
	it("applied adds eat the daily pool; unchanged repeats and errors do not", async () => {
		const addr = {
			profileId: "p2",
			line1: "1 A",
			city: "C",
			state: "S",
			country: "IN",
			postalCode: "1",
		};
		await call("add_address", addr);
		for (let i = 0; i < 10; i++) {
			await call("add_address", addr); // unchanged
			await call("remove_relation", { profileId: "p1", relationId: "nope" }); // NotFound
			now += 1000;
		}
		for (let i = 0; i < 5; i++) {
			const r = await call("add_address", { ...addr, postalCode: `9${i}` });
			expect(r.structuredContent.outcome, `call ${i}`).toBe("applied");
			now += 1000;
		}
		const blocked = await call("add_address", { ...addr, postalCode: "77" });
		expect(blocked.isError).toBe(true);
		expect(textOf(blocked)).toContain("Write quota reached");
	});

	it("burst counts every call", async () => {
		await call("remove_address", { profileId: "p2", addressId: "nope" });
		await call("add_relation", { profileId: "p1", toId: "p1", type: "brother" });
		expect(burst.limit).toHaveBeenCalledTimes(2);
	});
});
