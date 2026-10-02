import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/domain/permission";

const h = vi.hoisted(() => ({
	fresh: undefined as unknown as { sqlite: any; db: any },
	kv: new Map<string, string>(),
}));

vi.mock("@/db", async () => {
	const { freshDb } = await import("@/test/sqliteDb");
	h.fresh = freshDb();
	return { db: h.fresh.db };
});
vi.mock("cloudflare:workers", () => ({
	env: {
		KV: {
			get: async (k: string) => (h.kv.has(k) ? JSON.parse(h.kv.get(k)!) : null),
			put: async (k: string, v: string) => void h.kv.set(k, v),
			delete: async (k: string) => void h.kv.delete(k),
		},
	},
}));
vi.mock("@/lib/posthog-server", () => ({ captureMcpToolCalled: vi.fn() }));

const { createKutumbMcpHandler } = await import("../server");

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const authInfo = (actor: Actor) => ({
	token: "t",
	clientId: "c1",
	scopes: ["community:read"],
	extra: { actor },
});

async function rpc(method: string, params: unknown, actor: Actor = ACTOR) {
	const res = await createKutumbMcpHandler().fetch(
		new Request("https://kutumb.example.org/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
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

const call = (args: unknown, actor?: Actor) =>
	rpc("tools/call", { name: "get_family_graph", arguments: args }, actor);

const profile = (id: string, firstName: string, extra: Record<string, string | null> = {}) =>
	`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, gender, userId)
	 VALUES ('${id}', '${firstName}', 'Shah', '${extra.status ?? "active"}', '${extra.org ?? "o1"}', ${
			extra.gender ? `'${extra.gender}'` : "NULL"
		}, ${extra.userId ? `'${extra.userId}'` : "NULL"});`;

const relation = (id: string, from: string, to: string, type: string) =>
	`INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('${id}', '${from}', '${to}', 'o1', '${type}');`;

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id).sort();

// chain c0 - c1 - c2 - c3 - c4, so hop distance from c0 is the index
const chain = (n: number) =>
	Array.from({ length: n }, (_, i) => profile(`c${i}`, `C${i}`)).join("\n") +
	Array.from({ length: n - 1 }, (_, i) => relation(`cr${i}`, `c${i}`, `c${i + 1}`, "brother")).join(
		"\n"
	);

function seed(extra = "") {
	h.fresh.sqlite.exec(`
		DELETE FROM communityRelation; DELETE FROM communityProfile; DELETE FROM user;
		DELETE FROM organization;
		INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
		${extra}
	`);
}

const family = `
	${profile("jared", "Jared", { gender: "male", userId: "u1" })}
	${profile("anna", "Anna", { gender: "female" })}
	${profile("mia", "Mia", { gender: "female" })}
	${profile("far", "Far", {})}
	${profile("ghost", "Ghost", { status: "inactive" })}
	${profile("other", "Zed", { org: "o2" })}
	${relation("r1", "jared", "anna", "sister")}
	${relation("r2", "mia", "jared", "brother")}
	${relation("r3", "anna", "far", "mother")}
	${relation("r4", "jared", "ghost", "brother")}
`;

beforeEach(() => {
	h.kv.clear();
});

describe("get_family_graph", () => {
	it("defaults focus to the caller's own profile; node shape matches search item; edges keep stored direction", async () => {
		seed(family);
		const { result } = await call({ depth: 1 });
		expect(result.isError).toBeUndefined();
		const g = result.structuredContent;
		expect(ids(g.nodes)).toEqual(["anna", "jared", "mia"]);
		expect(g.nodes.find((n: { id: string }) => n.id === "anna")).toEqual({
			id: "anna",
			fullName: "Anna Shah",
			nickName: null,
			gender: "female",
			status: "active",
		});
		// "to is from's type": Anna is Jared's sister; Jared is Mia's brother
		expect(g.edges).toEqual(
			expect.arrayContaining([
				{ fromId: "jared", toId: "anna", type: "sister" },
				{ fromId: "mia", toId: "jared", type: "brother" },
			])
		);
		expect(g.edges).toHaveLength(2);
		expect(g.truncated).toBe(false);
		expect(JSON.parse(result.content[0].text)).toEqual(g);
	});

	it("depth defaults to 2", async () => {
		seed(family);
		const g = (await call({})).result.structuredContent;
		expect(ids(g.nodes)).toEqual(["anna", "far", "jared", "mia"]);
	});

	it("explicit focusId overrides own profile", async () => {
		seed(family);
		const g = (await call({ focusId: "far", depth: 1 })).result.structuredContent;
		expect(ids(g.nodes)).toEqual(["anna", "far"]);
	});

	it("clamps depth to 1..3", async () => {
		seed(chain(6));
		const hi = (await call({ focusId: "c0", depth: 99 })).result.structuredContent;
		expect(ids(hi.nodes)).toEqual(["c0", "c1", "c2", "c3"]);
		const lo = (await call({ focusId: "c0", depth: 0 })).result.structuredContent;
		expect(ids(lo.nodes)).toEqual(["c0", "c1"]);
	});

	it("caps at 200 nodes nearest-first, drops dangling edges, sets truncated", async () => {
		const spokes = Array.from({ length: 250 }, (_, i) => profile(`s${i}`, `S${i}`)).join("\n");
		const edges = Array.from({ length: 250 }, (_, i) =>
			relation(`sr${i}`, "hub", `s${i}`, "child")
		).join("\n");
		seed(`${profile("hub", "Hub")}\n${spokes}\n${edges}`);
		const g = (await call({ focusId: "hub", depth: 1 })).result.structuredContent;
		expect(g.nodes).toHaveLength(200);
		expect(g.nodes[0].id).toBe("hub");
		expect(g.truncated).toBe(true);
		const kept = new Set(g.nodes.map((n: { id: string }) => n.id));
		expect(g.edges).toHaveLength(199);
		for (const e of g.edges) {
			expect(kept.has(e.fromId) && kept.has(e.toId)).toBe(true);
		}
	});

	it("exactly 200 nodes is not truncated", async () => {
		const spokes = Array.from({ length: 199 }, (_, i) => profile(`s${i}`, `S${i}`)).join("\n");
		const edges = Array.from({ length: 199 }, (_, i) =>
			relation(`sr${i}`, "hub", `s${i}`, "child")
		).join("\n");
		seed(`${profile("hub", "Hub")}\n${spokes}\n${edges}`);
		const g = (await call({ focusId: "hub", depth: 1 })).result.structuredContent;
		expect(g.nodes).toHaveLength(200);
		expect(g.truncated).toBe(false);
	});

	it("no focusId and no own profile → isError asking for focusId", async () => {
		seed(family);
		const { result } = await call({}, { ...ACTOR, userId: "nobody" });
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("focusId");
	});

	it("unknown, inactive or cross-org focusId → NotFound isError", async () => {
		seed(family);
		for (const focusId of ["nope", "ghost", "other"]) {
			const { result } = await call({ focusId });
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toContain("not found");
		}
	});

	it("inactive profiles never appear as nodes or edges", async () => {
		seed(family);
		const g = (await call({ focusId: "jared" })).result.structuredContent;
		expect(g.nodes.map((n: { id: string }) => n.id)).not.toContain("ghost");
		expect(JSON.stringify(g.edges)).not.toContain("ghost");
	});

	it("description states the edge direction", async () => {
		const { result } = await rpc("tools/list", {});
		const tool = result.tools.find((t: { name: string }) => t.name === "get_family_graph");
		expect(tool.description).toContain("`to` is `from`'s `<type>`");
		expect(tool.annotations).toMatchObject({ readOnlyHint: true });
	});
});
