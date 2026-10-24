import { beforeEach, describe, expect, it, vi } from "vitest";
import { freshDb } from "@/test/sqliteDb";
import {
	GRAPH_KV_TTL_SECONDS,
	createGraphLru,
	getOrgGraphBlob,
	graphKey,
	type GraphKv,
	type OrgGraphBlob,
} from "./graph";

const profile = (id: string, over: { org?: string; status?: string } = {}) =>
	`INSERT INTO communityProfile (id, firstName, lastName, status, organizationId, email)
	 VALUES ('${id}', '${id}', 'Shah', '${over.status ?? "active"}', '${over.org ?? "o1"}', '${id}@x.test');`;
const relation = (id: string, from: string, to: string) =>
	`INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('${id}', '${from}', '${to}', 'o1', 'brother');`;
const setVersion = (org: string, v: number) =>
	`INSERT INTO orgDataVersion (organizationId, version) VALUES ('${org}', ${v})
	 ON CONFLICT(organizationId) DO UPDATE SET version = ${v};`;

function setup() {
	const fresh = freshDb();
	fresh.sqlite.exec(`
		INSERT INTO organization (id, name, slug, created_at) VALUES
			('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
	`);
	const store = new Map<string, string>();
	const kv = {
		get: vi.fn(async (key: string) => (store.has(key) ? JSON.parse(store.get(key)!) : null)),
		put: vi.fn(async (key: string, value: string) => void store.set(key, value)),
	} satisfies GraphKv;
	const pending: Promise<unknown>[] = [];
	const waitUntil = vi.fn((p: Promise<unknown>) => void pending.push(p));
	const lru = createGraphLru();
	const batch = vi.spyOn(fresh.db, "batch");
	const get = async (org = "o1") => {
		const blob = await getOrgGraphBlob({ db: fresh.db, kv, lru, waitUntil }, org);
		await Promise.all(pending.splice(0));
		return blob;
	};
	return { fresh, store, kv, waitUntil, lru, batch, get };
}

const ids = (b: OrgGraphBlob) => b.profiles.map((p) => p.id).sort();

describe("getOrgGraphBlob", () => {
	let s: ReturnType<typeof setup>;
	beforeEach(() => {
		s = setup();
	});

	it("miss everywhere: rebuilds from D1, puts graph:{org}:v{n} in KV with 24h TTL via waitUntil", async () => {
		s.fresh.sqlite.exec(`
			${profile("a")} ${profile("b")} ${profile("gone", { status: "inactive" })}
			${profile("x", { org: "o2" })}
			${relation("r1", "a", "b")} ${relation("r2", "a", "gone")}
		`);

		const blob = await s.get();

		expect(ids(blob)).toEqual(["a", "b"]);
		expect(blob.profiles[0]).toMatchObject({ email: expect.stringMatching(/@x\.test$/) });
		expect(blob.edges.map((e) => e.id)).toEqual(["r1"]); // edge to inactive dropped
		expect(graphKey("o1", 0)).toBe("graph:o1:v0");
		expect(s.kv.put).toHaveBeenCalledTimes(1);
		expect(s.kv.put).toHaveBeenCalledWith("graph:o1:v0", JSON.stringify(blob), {
			expirationTtl: GRAPH_KV_TTL_SECONDS,
		});
		expect(GRAPH_KV_TTL_SECONDS).toBe(86400);
		expect(s.waitUntil).toHaveBeenCalledTimes(1);
	});

	it("isolate LRU hit: no KV read, no rebuild", async () => {
		s.fresh.sqlite.exec(profile("a"));
		const first = await s.get();
		s.kv.get.mockClear();
		s.kv.put.mockClear();
		s.batch.mockClear();

		expect(await s.get()).toEqual(first);

		expect(s.kv.get).not.toHaveBeenCalled();
		expect(s.kv.put).not.toHaveBeenCalled();
		expect(s.batch).not.toHaveBeenCalled();
	});

	it("KV hit (cold isolate): no rebuild, no put, fills LRU", async () => {
		s.fresh.sqlite.exec(profile("a"));
		const first = await s.get();
		s.lru.clear();
		s.kv.put.mockClear();
		s.batch.mockClear();

		expect(await s.get()).toEqual(first);

		expect(s.kv.get).toHaveBeenLastCalledWith("graph:o1:v0", "json");
		expect(s.kv.put).not.toHaveBeenCalled();
		expect(s.batch).not.toHaveBeenCalled();
		s.kv.get.mockClear();
		await s.get();
		expect(s.kv.get).not.toHaveBeenCalled(); // now an LRU hit
	});

	it("new version → new key; old key left untouched; next read sees the write", async () => {
		s.fresh.sqlite.exec(profile("a"));
		await s.get();

		// what an applied makeProfileChanges plan does: data + version bump in one batch
		s.fresh.sqlite.exec(`${profile("b")} ${setVersion("o1", 1)}`);
		const blob = await s.get();

		expect(ids(blob)).toEqual(["a", "b"]);
		expect([...s.store.keys()].sort()).toEqual(["graph:o1:v0", "graph:o1:v1"]);
		expect(JSON.parse(s.store.get("graph:o1:v0")!).profiles).toHaveLength(1);
		expect(JSON.parse(s.store.get("graph:o1:v1")!).profiles).toHaveLength(2);
	});

	it("same version, warm caches: stale data is never served after a bump even with LRU + KV warm", async () => {
		s.fresh.sqlite.exec(profile("a"));
		await s.get();
		await s.get();
		s.fresh.sqlite.exec(`${profile("b")} ${setVersion("o1", 1)}`);
		expect(ids(await s.get())).toEqual(["a", "b"]);
	});

	it("rebuild returns data matching its version: a write landing between version read and rebuild", async () => {
		s.fresh.sqlite.exec(profile("a"));
		const realBatch = s.fresh.db.batch.bind(s.fresh.db);
		s.batch.mockImplementationOnce(((items: never) => {
			// version was read as 0; a write lands before the rebuild batch runs
			s.fresh.sqlite.exec(`${profile("b")} ${setVersion("o1", 1)}`);
			return realBatch(items);
		}) as never);

		const blob = await s.get();

		expect(ids(blob)).toEqual(["a", "b"]);
		expect(s.kv.put).toHaveBeenCalledWith("graph:o1:v1", expect.any(String), expect.anything()); // never "v0" with newer data
		expect(s.store.has("graph:o1:v0")).toBe(false);
	});

	it("malformed KV value is ignored: rebuilds and overwrites nothing else", async () => {
		s.fresh.sqlite.exec(profile("a"));
		s.store.set("graph:o1:v0", JSON.stringify({ nope: true }));

		const blob = await s.get();

		expect(ids(blob)).toEqual(["a"]);
		expect(s.kv.put).toHaveBeenCalledTimes(1);
	});

	it("orgs are isolated; LRU keeps at most 10 orgs", async () => {
		s.fresh.sqlite.exec(`${profile("a")} ${profile("x", { org: "o2" })}`);
		expect(ids(await s.get("o1"))).toEqual(["a"]);
		expect(ids(await s.get("o2"))).toEqual(["x"]);

		const cap = createGraphLru();
		for (let i = 0; i < 12; i++)
			cap.set(`org${i}`, { version: 0, blob: { profiles: [], edges: [] } });
		expect(cap.size).toBe(10);
		expect(cap.get("org0")).toBeUndefined();
		expect(cap.get("org11")).toBeDefined();
	});
});
