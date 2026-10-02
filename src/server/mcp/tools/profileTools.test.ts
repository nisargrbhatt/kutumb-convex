import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/domain/permission";

const h = vi.hoisted(() => ({ fresh: undefined as unknown as { sqlite: any; db: any } }));

vi.mock("@/db", async () => {
	const { freshDb } = await import("@/test/sqliteDb");
	h.fresh = freshDb();
	return { db: h.fresh.db };
});
vi.mock("@/lib/posthog-server", () => ({ captureMcpToolCalled: vi.fn() }));
vi.mock("cloudflare:workers", () => ({ env: { KV: {} } }));

const { createKutumbMcpHandler } = await import("../server");

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const authInfo = (actor: Actor) => ({
	token: "t",
	clientId: "c1",
	scopes: ["community:read"],
	extra: { actor },
});

async function call(name: string, args: unknown, actor: Actor = ACTOR) {
	const res = await createKutumbMcpHandler().fetch(
		new Request("https://kutumb.example.org/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: { name, arguments: args },
			}),
		}),
		{ authInfo: authInfo(actor) }
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

const profile = (
	id: string,
	firstName: string,
	extra: Record<string, string | null> = {},
	org = "o1"
) =>
	`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, gender, email, mobileNumber, dateOfBirth, comment, customFieldData)
	 VALUES ('${id}', '${firstName}', 'Shah', '${extra.status ?? "active"}', '${org}', ${
			extra.gender ? `'${extra.gender}'` : "NULL"
		}, ${extra.email ? `'${extra.email}'` : "NULL"}, '+91 99', '1990-01-02T00:00:00.000Z', 'a comment', ${
			extra.cfd ? `'${extra.cfd}'` : "NULL"
		});`;

beforeEach(() => {
	const { sqlite } = h.fresh;
	sqlite.exec(`
		DELETE FROM communityRelation; DELETE FROM communityAddress; DELETE FROM communityProfile;
		DELETE FROM communityProfileCustomField; DELETE FROM organization; DELETE FROM user;
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
		INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES
			('f1', 'Gotra', 'text', 'o1'), ('f2', 'Height', 'number', 'o1'), ('f3', 'Unset', 'text', 'o1');
		${profile("jared", "Jared", { gender: "male", email: "jared@x.test", cfd: '{"f1":"Kashyap","f2":180,"gone":"x"}' })}
		${profile("anna", "Anna", { gender: "female" })}
		${profile("mia", "Mia", { gender: "female", status: "inactive" })}
		${profile("other", "Zed", {}, "o2")}
		INSERT INTO communityAddress (id, line1, country, state, city, postalCode, type, communityProfileId)
			VALUES ('ad1', '1 Main St', 'IN', 'MH', 'Pune', '411001', 'home', 'jared');
		-- from=Jared,to=Anna,type=sister: "Anna is Jared's sister"
		INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('r1', 'jared', 'anna', 'o1', 'sister');
		-- from=Mia,to=Jared,type=brother: "Jared is Mia's brother"
		INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('r2', 'mia', 'jared', 'o1', 'brother');
	`);
});

describe("get_profile", () => {
	it("sisters example: outgoing/incoming keep stored type + counterpart gender, never inverted", async () => {
		const { result } = await call("get_profile", { id: "jared" });
		expect(result.isError).toBeUndefined();
		const p = result.structuredContent;
		expect(p.outgoing).toEqual([
			{
				type: "sister",
				counterpart: { id: "anna", fullName: "Anna Shah", gender: "female", status: "active" },
			},
		]);
		expect(p.incoming).toEqual([
			{
				type: "brother",
				counterpart: { id: "mia", fullName: "Mia Shah", gender: "female", status: "inactive" },
			},
		]);
		// The same rows seen from the other side swap sections, not types.
		const anna = (await call("get_profile", { id: "anna" })).result.structuredContent;
		expect(anna.outgoing).toEqual([]);
		expect(anna.incoming).toMatchObject([{ type: "sister", counterpart: { id: "jared" } }]);
	});

	it("field parity: every column but org id, addresses, labelled custom fields", async () => {
		const p = (await call("get_profile", { id: "jared" })).result.structuredContent;
		expect(p).toMatchObject({
			id: "jared",
			fullName: "Jared Shah",
			firstName: "Jared",
			lastName: "Shah",
			middleName: null,
			nickName: null,
			gender: "male",
			email: "jared@x.test",
			status: "active",
			bloodGroup: null,
			mobileNumber: "+91 99",
			dateOfBirth: "1990-01-02T00:00:00.000Z",
			dateOfDeath: null,
			comment: "a comment",
			userId: null,
		});
		expect(p).not.toHaveProperty("organizationId");
		expect(p).not.toHaveProperty("customFieldData");
		expect(p.addresses).toEqual([
			{
				id: "ad1",
				line1: "1 Main St",
				line2: null,
				city: "Pune",
				state: "MH",
				country: "IN",
				postalCode: "411001",
				type: "home",
				note: null,
				digipin: null,
			},
		]);
		// labelled; unset definition and orphan value are absent
		expect(p.customFields).toEqual([
			{ id: "f1", label: "Gotra", type: "text", value: "Kashyap" },
			{ id: "f2", label: "Height", type: "number", value: 180 },
		]);
	});

	it("returns profiles of any status", async () => {
		const { result } = await call("get_profile", { id: "mia" });
		expect(result.structuredContent).toMatchObject({ id: "mia", status: "inactive" });
	});

	it("text fallback mirrors structuredContent", async () => {
		const { result } = await call("get_profile", { id: "anna" });
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
	});

	it("cross-org id → NotFound isError", async () => {
		const { result } = await call("get_profile", { id: "other" });
		expect(result).toMatchObject({
			isError: true,
			content: [{ text: "Community Profile not found" }],
		});
	});

	it("description carries the ADR 0001 worked example", async () => {
		const res = await createKutumbMcpHandler().fetch(
			new Request("https://kutumb.example.org/api/mcp", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
			}),
			{ authInfo: authInfo(ACTOR) }
		);
		const text = await res.text();
		const json = JSON.parse(
			text.startsWith("event:")
				? text
						.split("\n")
						.find((l) => l.startsWith("data:"))!
						.slice(5)
				: text
		);
		const tool = json.result.tools.find((t: { name: string }) => t.name === "get_profile");
		expect(tool.description).toContain("sister");
		expect(tool.description).toContain("NEVER inverted");
		expect(tool.annotations).toMatchObject({ readOnlyHint: true });
	});
});

describe("search_profiles", () => {
	it("defaults: active only, own org", async () => {
		const { result } = await call("search_profiles", {});
		expect(result.structuredContent.items.map((i: { id: string }) => i.id).sort()).toEqual([
			"anna",
			"jared",
		]);
		expect(result.structuredContent.nextCursor).toBeNull();
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
	});

	it("status + gender + query", async () => {
		const inactive = await call("search_profiles", { status: "inactive" });
		expect(inactive.result.structuredContent.items).toMatchObject([{ id: "mia" }]);
		const f = await call("search_profiles", { gender: "female", query: "ann" });
		expect(f.result.structuredContent.items).toMatchObject([{ id: "anna", gender: "female" }]);
	});

	it("pages by cursor", async () => {
		const p1 = (await call("search_profiles", { limit: 1 })).result.structuredContent;
		expect(p1.items).toHaveLength(1);
		const p2 = (await call("search_profiles", { limit: 1, cursor: p1.nextCursor })).result
			.structuredContent;
		expect(p2.items).toHaveLength(1);
		expect(p2.items[0].id).not.toBe(p1.items[0].id);
		expect(p2.nextCursor).toBeNull();
	});

	it("limit above 100 is rejected by the input schema", async () => {
		const res = await call("search_profiles", { limit: 101 });
		expect(res.error ?? res.result?.isError).toBeTruthy();
	});
});
