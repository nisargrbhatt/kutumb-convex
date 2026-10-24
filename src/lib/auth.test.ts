import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: undefined as unknown }));

vi.mock("@/db", async () => {
	const { freshDb } = await import("@/test/sqliteDb");
	h.db = freshDb().db;
	return { db: h.db };
});
vi.mock("cloudflare:workers", () => ({
	env: {
		BETTER_AUTH_URL: "https://kutumb.example.org",
		BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
		BETTER_AUTH_DISABLE_SIGNUP: "0",
		GOOGLE_CLIENT_ID: "x",
		GOOGLE_CLIENT_SECRET: "x",
		RESEND_API_KEY: "re_test",
		KV: {},
		D1: {},
	},
	waitUntil: () => {},
}));
vi.mock("@/lib/posthog-server", () => ({
	captureMcpConnectionCreated: vi.fn(),
	captureLimitReached: vi.fn(),
}));

const { auth } = await import("./auth");

describe("better-auth OAuth routes", () => {
	it("/oauth2/update-consent is disabled (write can only be added through the consent screen)", async () => {
		const res = await auth.handler(
			new Request("https://kutumb.example.org/api/auth/oauth2/update-consent", {
				method: "POST",
				headers: { "content-type": "application/json", origin: "https://kutumb.example.org" },
				body: JSON.stringify({ id: "k1", update: { scopes: ["community:write"] } }),
			})
		);
		expect(res.status).toBe(404);
	});

	it("a live OAuth route is still served (the 404 above is the disabledPaths, not a broken mount)", async () => {
		const res = await auth.handler(
			new Request("https://kutumb.example.org/api/auth/ok", { method: "GET" })
		);
		expect(res.status).toBe(200);
	});
});
