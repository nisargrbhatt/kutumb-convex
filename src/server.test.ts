import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	tanstackFetch: vi.fn(
		async (_req: Request) =>
			new Response("tanstack", { status: 200, headers: { "Set-Cookie": "s=; Max-Age=0" } })
	),
	blobFetch: vi.fn(async (_req: Request) => new Response("blob", { status: 200 })),
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
	default: { fetch: h.tanstackFetch },
}));
vi.mock("@/server/blobRoute", () => ({ blobRoute: { fetch: h.blobFetch } }));

const { default: server } = await import("./server");

type WorkerRequest = Parameters<typeof server.fetch>[0];
const req = (path: string, init?: RequestInit) =>
	new Request(`https://k.test${path}`, init) as WorkerRequest;

describe("server entry fetch", () => {
	beforeEach(() => {
		h.tanstackFetch.mockClear();
		h.blobFetch.mockClear();
	});

	it("hands /api/blob/* to the blob route without reaching TanStack", async () => {
		const res = await server.fetch(req("/api/blob/o1/b1/avatar"));
		expect(await res.text()).toBe("blob");
		expect(h.blobFetch).toHaveBeenCalledTimes(1);
		expect(h.tanstackFetch).not.toHaveBeenCalled();
	});

	it("adds Clear-Site-Data cache on sign-out, keeping TanStack's cookies", async () => {
		const res = await server.fetch(req("/api/auth/sign-out", { method: "POST" }));
		expect(res.headers.get("Clear-Site-Data")).toBe('"cache"');
		expect(res.headers.get("Set-Cookie")).toBe("s=; Max-Age=0");
		expect(await res.text()).toBe("tanstack");
	});

	it("sends no Clear-Site-Data elsewhere", async () => {
		const res = await server.fetch(req("/api/auth/get-session"));
		expect(res.headers.has("Clear-Site-Data")).toBe(false);
	});

	it("hands other paths to TanStack", async () => {
		for (const path of ["/", "/api/auth/get-session", "/api/blobs", "/_serverFn/abc"]) {
			const res = await server.fetch(req(path));
			expect(await res.text()).toBe("tanstack");
		}
		expect(h.tanstackFetch).toHaveBeenCalledTimes(4);
		expect(h.blobFetch).not.toHaveBeenCalled();
	});
});

describe("server entry scheduled", () => {
	it("is a no-op that resolves", async () => {
		await expect(server.scheduled()).resolves.toBeUndefined();
	});
});
