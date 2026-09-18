import { describe, expect, it, vi } from "vitest";
import type { RateLimit } from "better-auth/types";
import { createKvRateLimitStorage } from "./rate-limit-kv";

function fakeKv() {
	return {
		get: vi.fn(async (_key: string, _type: "json"): Promise<RateLimit | null> => null),
		put: vi.fn(
			async (_key: string, _value: string, _options?: { expirationTtl?: number }): Promise<void> =>
				undefined
		),
	};
}

describe("createKvRateLimitStorage", () => {
	it("namespaces the key so rate-limit entries can't collide with other KV data", async () => {
		const kv = fakeKv();
		const storage = createKvRateLimitStorage(kv);

		await storage.get("1.2.3.4:/sign-in/email");

		expect(kv.get).toHaveBeenCalledWith("rate-limit:1.2.3.4:/sign-in/email", "json");
	});

	it("returns null when the key isn't in KV", async () => {
		const kv = fakeKv();
		const storage = createKvRateLimitStorage(kv);

		await expect(storage.get("missing")).resolves.toBeNull();
	});

	it("round-trips the stored RateLimit value", async () => {
		const kv = fakeKv();
		kv.get.mockResolvedValueOnce({ key: "k", count: 2, lastRequest: 123 });
		const storage = createKvRateLimitStorage(kv);

		await expect(storage.get("k")).resolves.toEqual({ key: "k", count: 2, lastRequest: 123 });
	});

	it("writes the namespaced key as JSON with an expirationTtl", async () => {
		const kv = fakeKv();
		const storage = createKvRateLimitStorage(kv);

		await storage.set("1.2.3.4:/sign-in/email", { key: "k", count: 1, lastRequest: 123 });

		expect(kv.put).toHaveBeenCalledWith(
			"rate-limit:1.2.3.4:/sign-in/email",
			JSON.stringify({ key: "k", count: 1, lastRequest: 123 }),
			{ expirationTtl: expect.any(Number) }
		);
	});

	it("uses a TTL of at least 60s (KV's floor) so entries outlive the widest rate-limit window", async () => {
		const kv = fakeKv();
		const storage = createKvRateLimitStorage(kv);

		await storage.set("k", { key: "k", count: 1, lastRequest: 123 });

		const [, , options] = kv.put.mock.calls[0];
		expect(options?.expirationTtl).toBeGreaterThanOrEqual(60);
	});
});
