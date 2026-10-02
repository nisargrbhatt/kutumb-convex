import type { BetterAuthRateLimitOptions } from "better-auth/types";

type RateLimitStorage = NonNullable<BetterAuthRateLimitOptions["customStorage"]>;

// Rows older than the widest rule window (OAuth register, 1h) are already reset by consume().
const PRUNE_AFTER_MS = 60 * 60 * 1000;

// One atomic statement: reset when the window elapsed, else always count the attempt.
// Allowed iff the new count <= max; blocked attempts keep last_request so they don't
// extend the window.
const CONSUME_SQL = `
INSERT INTO rate_limit (key, count, last_request) VALUES (?1, 1, ?2)
ON CONFLICT (key) DO UPDATE SET
	count = CASE
		WHEN ?2 - last_request >= ?3 THEN 1
		ELSE count + 1
	END,
	last_request = CASE
		WHEN ?2 - last_request >= ?3 OR count < ?4 THEN ?2
		ELSE last_request
	END
RETURNING count, last_request AS lastRequest`;

/**
 * better-auth `rateLimit.customStorage` over the `D1` binding. Strongly consistent,
 * unlike the KV shim it replaces. Rate limiting only — see auth.ts.
 */
export function createD1RateLimitStorage(d1: D1Database): RateLimitStorage {
	return {
		consume: async (key, rule) => {
			const now = Date.now();
			const windowMs = rule.window * 1000;
			const row = await d1
				.prepare(CONSUME_SQL)
				.bind(key, now, windowMs, rule.max)
				.first<{ count: number; lastRequest: number }>();
			if (!row) throw new Error("rate_limit consume returned no row");

			if (row.count <= rule.max) {
				if (row.count === 1) {
					// New window: opportunistically drop stale keys (e.g. one-off IPs).
					await d1
						.prepare("DELETE FROM rate_limit WHERE last_request < ?1")
						.bind(now - PRUNE_AFTER_MS)
						.run()
						.catch((error) => console.error("rate_limit prune failed", error));
				}
				return { allowed: true, retryAfter: null };
			}
			return {
				allowed: false,
				retryAfter: Math.max(1, Math.ceil((row.lastRequest + windowMs - now) / 1000)),
			};
		},
	};
}
