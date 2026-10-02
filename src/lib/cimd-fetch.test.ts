import { describe, expect, it, vi } from "vitest";
import { CIMD_CACHE_TTL_SECONDS, CIMD_MAX_BODY_BYTES } from "@/domain/cimd";
import { createCimdFetcher } from "./cimd-fetch";

const OWN = "https://kutumb.example.org";
const URL_ID = "https://client.example.com/oauth/client.json";
const doc = (over: Record<string, unknown> = {}) =>
	JSON.stringify({ client_id: URL_ID, client_name: "Client", redirect_uris: [], ...over });
const jsonResponse = (body: string, init: ResponseInit = {}) =>
	new Response(body, {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});

function fakeKv() {
	const store = new Map<string, string>();
	return {
		store,
		get: vi.fn(async (k: string) => store.get(k) ?? null),
		put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
	};
}

function setup(fetchImpl: typeof fetch) {
	const kv = fakeKv();
	const fetchSpy = vi.fn(fetchImpl);
	const fetcher = createCimdFetcher({
		kv: kv as unknown as KVNamespace,
		ownOrigin: OWN,
		fetch: fetchSpy,
		timeoutMs: 50,
	});
	return { kv, fetchSpy, fetcher };
}

describe("createCimdFetcher guards", () => {
	it.each([
		["http", "http://client.example.com/c.json"],
		["IP literal", "https://203.0.113.9/c.json"],
		["own origin", `${OWN}/api/auth/jwks`],
	])("rejects %s without fetching", async (_n, url) => {
		const { fetcher, fetchSpy } = setup(async () => jsonResponse(doc()));
		await expect(fetcher(url)).rejects.toThrow();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("never follows redirects", async () => {
		const { fetcher, fetchSpy } = setup(
			async () => new Response(null, { status: 302, headers: { location: "https://evil.test/" } })
		);
		await expect(fetcher(URL_ID)).rejects.toThrow(/redirect/i);
		expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
	});

	it("rejects a body over the cap (declared length)", async () => {
		const { fetcher } = setup(async () =>
			jsonResponse("{}", {
				headers: { "content-type": "application/json", "content-length": "99999999" },
			})
		);
		await expect(fetcher(URL_ID)).rejects.toThrow(/too large/i);
	});

	it("rejects a body over the cap (streamed, no length)", async () => {
		const big = doc({ pad: "x".repeat(CIMD_MAX_BODY_BYTES) });
		const { fetcher } = setup(async () => jsonResponse(big));
		await expect(fetcher(URL_ID)).rejects.toThrow(/too large/i);
	});

	it("times out a hanging fetch", async () => {
		const { fetcher } = setup(
			(_i, init) =>
				new Promise((_res, rej) =>
					init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))
				)
		);
		await expect(fetcher(URL_ID)).rejects.toThrow(/aborted/);
	});

	it("times out a stalled body", async () => {
		const stalled = new ReadableStream({ start() {} });
		const { fetcher } = setup(
			async () =>
				new Response(stalled, { status: 200, headers: { "content-type": "application/json" } })
		);
		await expect(fetcher(URL_ID)).rejects.toThrow(/timed out/);
	});

	it("rejects when JSON client_id differs from the URL", async () => {
		const { fetcher, kv } = setup(async () =>
			jsonResponse(doc({ client_id: "https://other.example/x" }))
		);
		await expect(fetcher(URL_ID)).rejects.toThrow(/client_id/);
		expect(kv.put).not.toHaveBeenCalled();
	});
});

describe("createCimdFetcher happy path + cache", () => {
	it("returns the document and caches it in KV for ~1h", async () => {
		const { fetcher, kv, fetchSpy } = setup(async () => jsonResponse(doc()));
		const res = await fetcher(URL_ID);
		expect(res.status).toBe(200);
		expect(((await res.json()) as { client_id: string }).client_id).toBe(URL_ID);
		expect(kv.put).toHaveBeenCalledWith(expect.stringContaining(URL_ID), expect.any(String), {
			expirationTtl: CIMD_CACHE_TTL_SECONDS,
		});
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("serves a second fetch from KV without hitting the network", async () => {
		const { fetcher, fetchSpy } = setup(async () => jsonResponse(doc()));
		await fetcher(URL_ID);
		const again = await fetcher(URL_ID);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(again.status).toBe(200);
		expect(again.headers.get("content-type")).toMatch(/json/);
		expect(((await again.json()) as { client_id: string }).client_id).toBe(URL_ID);
	});

	it("treats a corrupt KV entry as a miss and refetches", async () => {
		const { fetcher, kv, fetchSpy } = setup(async () => jsonResponse(doc()));
		kv.store.set(`cimd:${URL_ID}`, "{not json");
		expect((await fetcher(URL_ID)).status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("still returns the document when KV reads and writes fail", async () => {
		const { fetcher, kv } = setup(async () => jsonResponse(doc()));
		kv.get.mockRejectedValue(new Error("kv down"));
		kv.put.mockRejectedValue(new Error("kv limit"));
		expect((await fetcher(URL_ID)).status).toBe(200);
	});

	it("tells the plugin how much freshness is left on a KV hit", async () => {
		const { fetcher } = setup(async () => jsonResponse(doc()));
		await fetcher(URL_ID);
		const hit = await fetcher(URL_ID);
		const age = Number(/max-age=(\d+)/.exec(hit.headers.get("cache-control") ?? "")?.[1]);
		expect(age).toBeGreaterThan(CIMD_CACHE_TTL_SECONDS - 5);
		expect(age).toBeLessThanOrEqual(CIMD_CACHE_TTL_SECONDS);
	});

	it("passes non-client documents (jwks) through uncached", async () => {
		const { fetcher, kv } = setup(async () => jsonResponse(JSON.stringify({ keys: [] })));
		const res = await fetcher("https://client.example.com/jwks.json");
		expect(await res.json()).toEqual({ keys: [] });
		expect(kv.put).not.toHaveBeenCalled();
	});

	it("passes non-200 through uncached", async () => {
		const { fetcher, kv } = setup(async () => new Response("nope", { status: 404 }));
		expect((await fetcher(URL_ID)).status).toBe(404);
		expect(kv.put).not.toHaveBeenCalled();
	});
});
