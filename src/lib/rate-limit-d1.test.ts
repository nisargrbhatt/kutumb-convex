import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1RateLimitStorage } from "./rate-limit-d1";

// Minimal D1 stand-in over node:sqlite, enough for prepare().bind().first().
function fakeD1() {
	const sqlite = new DatabaseSync(":memory:");
	sqlite.exec(
		"CREATE TABLE rate_limit (key text PRIMARY KEY NOT NULL, count integer NOT NULL, last_request integer NOT NULL)"
	);
	const d1 = {
		prepare: (sql: string) => ({
			bind: (...params: unknown[]) => ({
				first: async () =>
					(sqlite.prepare(sql).get(...(params as never[])) as Record<string, unknown>) ?? null,
				run: async () => sqlite.prepare(sql).run(...(params as never[])),
			}),
		}),
	} as unknown as D1Database;
	return { d1, sqlite };
}

const rule = { window: 10, max: 3 };

describe("createD1RateLimitStorage.consume", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
	});
	afterEach(() => vi.useRealTimers());

	it("allows up to max requests then blocks with retryAfter", async () => {
		const { d1 } = fakeD1();
		const storage = createD1RateLimitStorage(d1);

		for (let i = 0; i < 3; i++) {
			vi.advanceTimersByTime(1000);
			await expect(storage.consume("k", rule)).resolves.toEqual({
				allowed: true,
				retryAfter: null,
			});
		}
		vi.advanceTimersByTime(1000);
		// last allowed request was 1s ago, window 10s
		await expect(storage.consume("k", rule)).resolves.toEqual({ allowed: false, retryAfter: 9 });
	});

	it("blocks over-max requests landing in the same millisecond", async () => {
		const { d1 } = fakeD1();
		const storage = createD1RateLimitStorage(d1);

		const results = [];
		for (let i = 0; i < 5; i++) results.push((await storage.consume("k", rule)).allowed);

		expect(results).toEqual([true, true, true, false, false]);
	});

	it("does not extend the window on blocked requests", async () => {
		const { d1 } = fakeD1();
		const storage = createD1RateLimitStorage(d1);
		for (let i = 0; i < 3; i++) {
			vi.advanceTimersByTime(1000);
			await storage.consume("k", rule);
		}
		vi.advanceTimersByTime(2000);
		const first = await storage.consume("k", rule);
		vi.advanceTimersByTime(2000);
		const second = await storage.consume("k", rule);

		expect(first.retryAfter).toBe(8);
		expect(second.retryAfter).toBe(6);
	});

	it("resets the count once the window has elapsed", async () => {
		const { d1, sqlite } = fakeD1();
		const storage = createD1RateLimitStorage(d1);
		for (let i = 0; i < 3; i++) {
			vi.advanceTimersByTime(1000);
			await storage.consume("k", rule);
		}
		vi.advanceTimersByTime(10_000);

		await expect(storage.consume("k", rule)).resolves.toEqual({ allowed: true, retryAfter: null });
		expect(sqlite.prepare("SELECT count FROM rate_limit WHERE key = 'k'").get()).toEqual({
			count: 1,
		});
	});

	it("tracks keys independently", async () => {
		const { d1 } = fakeD1();
		const storage = createD1RateLimitStorage(d1);
		for (let i = 0; i < 3; i++) {
			vi.advanceTimersByTime(1000);
			await storage.consume("a", rule);
		}
		vi.advanceTimersByTime(1000);

		await expect(storage.consume("b", rule)).resolves.toEqual({ allowed: true, retryAfter: null });
		await expect(storage.consume("a", rule)).resolves.toMatchObject({ allowed: false });
	});

	it("prunes rows older than the rule window when starting a fresh window", async () => {
		const { d1, sqlite } = fakeD1();
		const storage = createD1RateLimitStorage(d1);
		await storage.consume("stale", rule);
		vi.advanceTimersByTime(2 * 3_600_000);

		await storage.consume("fresh", rule);

		expect(sqlite.prepare("SELECT key FROM rate_limit").all()).toEqual([{ key: "fresh" }]);
	});
});
