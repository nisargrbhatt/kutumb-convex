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
		DELETE FROM changeRequest; DELETE FROM communityRelation; DELETE FROM communityAddress; DELETE FROM communityProfile;
		DELETE FROM communityProfileCustomField; DELETE FROM organization; DELETE FROM user;
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
		INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES
			('f1', 'Gotra', 'text', 'o1'), ('f2', 'Height', 'number', 'o1'), ('f3', 'Unset', 'text', 'o1'),
			('f4', 'Anniversary', 'date', 'o1'), ('x1', 'Other org field', 'text', 'o2');
		${profile("jared", "Jared", { gender: "male", email: "jared@x.test", cfd: '{"f1":"Kashyap","f2":180,"f4":"2010-06-15T00:00:00.000Z","gone":"x"}' })}
		${profile("anna", "Anna", { gender: "female" })}
		${profile("mia", "Mia", { gender: "female" })}
		${profile("ivy", "Ivy", { gender: "female", status: "inactive" })}
		${profile("dina", "Dina", { status: "draft" })}
		${profile("me", "Me", { status: "inactive" })}
		UPDATE communityProfile SET userId = 'u1' WHERE id = 'me';
		INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
			VALUES ('cr1', 'o1', 'dina', 'Dina Shah', 'create', 'pending', 'u1', 'U1', 0);
		${profile("other", "Zed", {}, "o2")}
		INSERT INTO communityAddress (id, line1, country, state, city, postalCode, type, communityProfileId)
			VALUES ('ad1', '1 Main St', 'IN', 'MH', 'Pune', '411001', 'home', 'jared');
		-- from=Jared,to=Anna,type=sister: "Anna is Jared's sister"
		INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('r1', 'jared', 'anna', 'o1', 'sister');
		-- from=Mia,to=Jared,type=brother: "Jared is Mia's brother"
		INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('r2', 'mia', 'jared', 'o1', 'brother');
		INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES
			('r3', 'jared', 'ivy', 'o1', 'sister'), ('r4', 'dina', 'jared', 'o1', 'brother'),
			('r5', 'jared', 'me', 'o1', 'brother');
	`);
});

describe("get_profile", () => {
	it("sisters example: outgoing/incoming keep stored type + counterpart gender, never inverted", async () => {
		const { result } = await call("get_profile", { id: "jared" });
		expect(result.isError).toBeUndefined();
		const p = result.structuredContent;
		expect(p.outgoing).toEqual([
			{
				id: "r1",
				type: "sister",
				counterpart: { id: "anna", fullName: "Anna Shah", gender: "female", status: "active" },
			},
		]);
		expect(p.incoming).toEqual([
			{
				id: "r2",
				type: "brother",
				counterpart: { id: "mia", fullName: "Mia Shah", gender: "female", status: "active" },
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
			dateOfBirth: "1990-01-02",
			dateOfDeath: null,
			comment: "a comment",
			userId: null,
		});
		expect(p).not.toHaveProperty("organizationId");
		expect(p).not.toHaveProperty("customFieldData");
		// Concurrency handles for the write tools: profile + each address carry `version`.
		expect(p.version).toBe(0);
		expect(p.addresses).toEqual([
			{
				id: "ad1",
				version: 0,
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
	});

	describe("myPendingRequests", () => {
		it("lists only the caller's own pending requests on that profile", async () => {
			h.fresh.sqlite.exec(`
				INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u2', 'U2', 'u2@x.test', 1, 0, 0);
				INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt) VALUES
					('mine', 'o1', 'jared', 'Jared Shah', 'info', 'pending', 'u1', 'U1', 86400000),
					('mine-done', 'o1', 'jared', 'Jared Shah', 'info', 'approved', 'u1', 'U1', 0),
					('theirs', 'o1', 'jared', 'Jared Shah', 'info', 'pending', 'u2', 'U2', 0),
					('elsewhere', 'o1', 'anna', 'Anna Shah', 'info', 'pending', 'u1', 'U1', 0);
			`);
			const jared = (await call("get_profile", { id: "jared" })).result.structuredContent;
			expect(jared.myPendingRequests).toEqual([
				{ id: "mine", kind: "info", createdAt: "1970-01-02T00:00:00.000Z" },
			]);
			const mia = (await call("get_profile", { id: "mia" })).result.structuredContent;
			expect(mia.myPendingRequests).toEqual([]);
		});
	});

	describe("custom fields", () => {
		it("lists every definition in order; unset → null, orphan value hidden, dates as YYYY-MM-DD", async () => {
			const p = (await call("get_profile", { id: "jared" })).result.structuredContent;
			expect(p.customFields).toEqual([
				{ id: "f1", label: "Gotra", type: "text", value: "Kashyap" },
				{ id: "f2", label: "Height", type: "number", value: 180 },
				{ id: "f3", label: "Unset", type: "text", value: null },
				{ id: "f4", label: "Anniversary", type: "date", value: "2010-06-15" },
			]);
		});

		it("a profile with no values still lists every definition as null", async () => {
			const p = (await call("get_profile", { id: "anna" })).result.structuredContent;
			expect(p.customFields).toEqual([
				{ id: "f1", label: "Gotra", type: "text", value: null },
				{ id: "f2", label: "Height", type: "number", value: null },
				{ id: "f3", label: "Unset", type: "text", value: null },
				{ id: "f4", label: "Anniversary", type: "date", value: null },
			]);
		});

		it("a deleted definition's value disappears even though it stays stored", async () => {
			h.fresh.sqlite.exec("DELETE FROM communityProfileCustomField WHERE id = 'f1'");
			const p = (await call("get_profile", { id: "jared" })).result.structuredContent;
			expect(p.customFields.map((f: { id: string }) => f.id)).toEqual(["f2", "f3", "f4"]);
		});

		it("dateOfDeath is YYYY-MM-DD too", async () => {
			h.fresh.sqlite.exec(
				"UPDATE communityProfile SET dateOfDeath = '2020-12-31T00:00:00.000Z' WHERE id = 'jared'"
			);
			const p = (await call("get_profile", { id: "jared" })).result.structuredContent;
			expect(p.dateOfDeath).toBe("2020-12-31");
		});

		it("a legacy over-500-char text value still reads back", async () => {
			const long = "y".repeat(600);
			h.fresh.sqlite.exec(
				`UPDATE communityProfile SET customFieldData = '{"f1":"${long}"}' WHERE id = 'jared'`
			);
			const { result } = await call("get_profile", { id: "jared" });
			expect(result.isError).toBeUndefined();
			expect(result.structuredContent.customFields[0].value).toBe(long);
		});
	});

	describe("whoami + list_custom_fields", () => {
		const EXPECTED = [
			{ id: "f1", label: "Gotra", type: "text" },
			{ id: "f2", label: "Height", type: "number" },
			{ id: "f3", label: "Unset", type: "text" },
			{ id: "f4", label: "Anniversary", type: "date" },
		];

		it("whoami carries this org's definitions in order", async () => {
			const { result } = await call("whoami", {});
			expect(result.structuredContent.customFields).toEqual(EXPECTED);
		});

		it("list_custom_fields returns the same list", async () => {
			const who = (await call("whoami", {})).result.structuredContent;
			const { result } = await call("list_custom_fields", {});
			expect(result.structuredContent).toEqual({ customFields: who.customFields });
			expect(result.structuredContent.customFields).toEqual(EXPECTED);
			expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
		});

		it("other orgs' fields never leak", async () => {
			const { result } = await call("list_custom_fields", {}, { ...ACTOR, organizationId: "o2" });
			expect(result.structuredContent.customFields).toEqual([
				{ id: "x1", label: "Other org field", type: "text" },
			]);
		});
	});

	describe("active only, every role", () => {
		const ROLES: Actor[] = [ACTOR, { ...ACTOR, role: "admin" }, { ...ACTOR, role: "owner" }];

		it("non-active subject → NotFound, except the caller's own linked profile and own drafts", async () => {
			for (const actor of ROLES) {
				const { result } = await call("get_profile", { id: "ivy" }, actor);
				expect(result, `${actor.role} ivy`).toMatchObject({
					isError: true,
					content: [{ text: "Community Profile not found" }],
				});
				const own = await call("get_profile", { id: "me" }, actor);
				expect(own.result.structuredContent).toMatchObject({ id: "me", status: "inactive" });
				// Read-your-writes: the draft this Actor created (pending create request) shows.
				const draft = await call("get_profile", { id: "dina" }, actor);
				expect(draft.result.structuredContent, `${actor.role} dina`).toMatchObject({
					id: "dina",
					status: "draft",
				});
			}
		});

		it("someone else's draft stays NotFound", async () => {
			const { result } = await call("get_profile", { id: "dina" }, { ...ACTOR, userId: "u2" });
			expect(result).toMatchObject({
				isError: true,
				content: [{ text: "Community Profile not found" }],
			});
		});

		it("counterparts: active only (inactive, draft, own inactive dropped)", async () => {
			for (const actor of ROLES) {
				const p = (await call("get_profile", { id: "jared" }, actor)).result.structuredContent;
				expect(p.outgoing.map((r: { counterpart: { id: string } }) => r.counterpart.id)).toEqual([
					"anna",
				]);
				expect(p.incoming.map((r: { counterpart: { id: string } }) => r.counterpart.id)).toEqual([
					"mia",
				]);
			}
		});
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
			"mia",
		]);
		expect(result.structuredContent.nextCursor).toBeNull();
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
	});

	it("no status input: always active only, every role", async () => {
		for (const role of ["member", "admin", "owner"] as const) {
			const res = await call("search_profiles", { status: "inactive" }, { ...ACTOR, role });
			expect(res.result.structuredContent.items.map((i: { id: string }) => i.id).sort()).toEqual([
				"anna",
				"jared",
				"mia",
			]);
		}
	});

	it("gender + query", async () => {
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
		const p3 = (await call("search_profiles", { limit: 1, cursor: p2.nextCursor })).result
			.structuredContent;
		expect(p3.items).toHaveLength(1);
		expect(p3.nextCursor).toBeNull();
	});

	it("limit above 100 is rejected by the input schema", async () => {
		const res = await call("search_profiles", { limit: 101 });
		expect(res.error ?? res.result?.isError).toBeTruthy();
	});
});

describe("search_profiles filters", () => {
	const search = async (args: unknown) => (await call("search_profiles", args)).result;
	const idsOf = (result: { structuredContent: { items: { id: string }[] } }) =>
		result.structuredContent.items.map((i) => i.id).sort();

	it("core + custom filters narrow the result; items echo only what was filtered", async () => {
		h.fresh.sqlite.exec(`
			UPDATE communityProfile SET bloodGroup = 'A+' WHERE id IN ('jared', 'anna');
			UPDATE communityProfile SET dateOfDeath = '2020-01-01T00:00:00.000Z' WHERE id = 'anna';
		`);
		const result = await search({
			bloodGroup: ["A+"],
			living: true,
			customFieldFilters: [{ field: "gotra", op: "eq", value: "kashyap" }],
		});
		expect(result.isError).toBeUndefined();
		expect(result.structuredContent.items).toEqual([
			{
				id: "jared",
				fullName: "Jared Shah",
				nickName: null,
				gender: "male",
				status: "active",
				bloodGroup: "A+",
				dateOfDeath: null,
				customFields: [{ id: "f1", label: "Gotra", type: "text", value: "Kashyap" }],
			},
		]);
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
	});

	it("city filter matches any address and echoes the matching one", async () => {
		const result = await search({ city: " pune " });
		expect(result.structuredContent.items).toMatchObject([
			{ id: "jared", addresses: [{ city: "Pune" }] },
		]);
	});

	it("bad filters → isError Invalid message with the hint, not Internal error", async () => {
		const op = await search({
			customFieldFilters: [{ field: "Height", op: "contains", value: "1" }],
		});
		expect(op.isError).toBe(true);
		expect(op.content[0].text).toMatch(/does not apply to number.*Use one of: eq, gt/);

		const unknown = await search({ customFieldFilters: [{ field: "Nope", op: "isSet" }] });
		expect(unknown.content[0].text).toMatch(/Unknown custom field "Nope".*Valid fields: .*Gotra/);

		const many = await search({
			customFieldFilters: Array.from({ length: 6 }, () => ({ field: "f1", op: "isSet" })),
		});
		expect(many.content[0].text).toMatch(/At most 5/);

		const day = await search({ bornOnOrAfter: "yesterday" });
		expect(day.content[0].text).toMatch(/YYYY-MM-DD/);
	});

	it("only active profiles of the caller's org, every role", async () => {
		for (const role of ["member", "admin", "owner"] as const) {
			const res = (await call("search_profiles", { living: true }, { ...ACTOR, role })).result;
			expect(idsOf(res)).toEqual(["anna", "jared", "mia"]);
		}
	});

	it("tool description tells the model to pass living: true for alive/today", async () => {
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
		const tool = json.result.tools.find((t: { name: string }) => t.name === "search_profiles");
		expect(tool.description).toContain("living: true");
		expect(tool.inputSchema.properties).toHaveProperty("customFieldFilters");
		expect(tool.inputSchema.properties).toHaveProperty("bloodGroup");
	});
});
