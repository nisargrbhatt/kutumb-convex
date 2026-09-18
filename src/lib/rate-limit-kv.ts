import type { RateLimit } from "better-auth/types";

interface RateLimitKvBinding {
	get: (key: string, type: "json") => Promise<RateLimit | null>;
	put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
}

const KEY_PREFIX = "rate-limit:";
// Comfortably outlives better-auth's widest built-in window (60s) without
// letting entries sit in KV forever. KV's floor is 60s.
const TTL_SECONDS = 300;

/**
 * better-auth `rateLimit.customStorage` get/set shim over the `KV` binding.
 * Rate limiting only — never point session/secondaryStorage at KV, see auth.ts.
 */
export function createKvRateLimitStorage(kv: RateLimitKvBinding) {
	return {
		get: (key: string) => kv.get(`${KEY_PREFIX}${key}`, "json"),
		set: async (key: string, value: RateLimit) => {
			await kv.put(`${KEY_PREFIX}${key}`, JSON.stringify(value), { expirationTtl: TTL_SECONDS });
		},
	};
}
