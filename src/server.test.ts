import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	tanstackFetch: vi.fn(async () => new Response("tanstack", { status: 200 })),
}));

vi.mock("@tanstack/react-start/server-entry", () => ({
	default: { fetch: h.tanstackFetch },
}));

const { default: server } = await import("./server");

type WorkerRequest = Parameters<typeof server.fetch>[0];
const req = (path: string) => new Request(`https://k.test${path}`) as WorkerRequest;

describe("server entry fetch", () => {
	beforeEach(() => h.tanstackFetch.mockClear());

	it("returns 404 for /api/blob/* without reaching TanStack", async () => {
		const res = await server.fetch(req("/api/blob/x"));
		expect(res.status).toBe(404);
		expect(h.tanstackFetch).not.toHaveBeenCalled();
	});

	it("hands other paths to TanStack", async () => {
		for (const path of ["/", "/api/auth/get-session", "/api/blobs", "/_serverFn/abc"]) {
			const res = await server.fetch(req(path));
			expect(await res.text()).toBe("tanstack");
		}
		expect(h.tanstackFetch).toHaveBeenCalledTimes(4);
	});
});

describe("server entry scheduled", () => {
	it("is a no-op that resolves", async () => {
		await expect(server.scheduled()).resolves.toBeUndefined();
	});
});
