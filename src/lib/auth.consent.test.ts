import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
	sqlite: undefined as unknown as {
		exec(sql: string): void;
		prepare(sql: string): { all(...p: unknown[]): Record<string, unknown>[] };
	},
}));

vi.mock("@/db", async () => {
	const { freshDb } = await import("@/test/sqliteDb");
	const fresh = freshDb();
	h.sqlite = fresh.sqlite as never;
	return { db: fresh.db };
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

const { consentScopeFor } = await import("@/domain/mcpOauth");
const { auth } = await import("./auth");
const { markOrgPicked } = await import("./oauth-flow");

const ORIGIN = "https://kutumb.example.org";
const REDIRECT = "http://127.0.0.1:9999/callback";
const rows = (q: string) => h.sqlite.prepare(q).all();

const post = (path: string, body: unknown, cookie?: string) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth/${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				...(cookie ? { cookie } : {}),
			},
			body: JSON.stringify(body),
		})
	);

const cookieOf = (res: Response) =>
	res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");

/** A member signed in with an active org, plus a public OAuth client ready to authorize. */
async function connectAs() {
	await post("sign-up/email", { name: "Mia", email: "mia@x.test", password: "password-123" });
	h.sqlite.exec(`
		INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
		INSERT INTO member (id, organization_id, user_id, role, created_at)
			SELECT 'm1', 'o1', id, 'member', 0 FROM user WHERE email = 'mia@x.test';
		INSERT INTO oauth_client (id, client_id, name, redirect_uris, token_endpoint_auth_method, grant_types, response_types, require_pkce, scopes)
			VALUES ('oc1', 'c1', 'Claude', '["${REDIRECT}"]', 'none', '["authorization_code","refresh_token"]', '["code"]', 1,
				'community:read community:write offline_access');
	`);
	const signedIn = await post("sign-in/email", { email: "mia@x.test", password: "password-123" });
	const cookie = cookieOf(signedIn);
	return cookie;
}

async function authorize(cookie: string, scope: string) {
	const params = new URLSearchParams({
		client_id: "c1",
		response_type: "code",
		redirect_uri: REDIRECT,
		scope,
		state: "s",
		code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		code_challenge_method: "S256",
	});
	const res = await auth.handler(
		new Request(`${ORIGIN}/api/auth/oauth2/authorize?${params}`, { headers: { cookie } })
	);
	const location = res.headers.get("location") ?? "";
	return { res, query: location.includes("?") ? location.slice(location.indexOf("?") + 1) : "" };
}

const ASKED = "community:read community:write offline_access";
const consentScopes = () =>
	JSON.parse(
		(rows(`SELECT scopes FROM oauth_consent WHERE client_id = 'c1'`)[0]?.scopes as
			| string
			| undefined) ?? "null"
	)?.sort() as string[] | undefined;

describe("consent subset round-trip (better-auth oauth-provider)", () => {
	let cookie: string;
	let sessionId: string;
	beforeAll(async () => {
		cookie = await connectAs();
		sessionId = rows(`SELECT id FROM session ORDER BY created_at DESC LIMIT 1`)[0]!.id as string;
	});
	beforeEach(async () => {
		h.sqlite.exec(`DELETE FROM oauth_consent`);
		// The org pick is read once per authorize.
		await markOrgPicked(sessionId, "o1");
	});

	/** The consent screen's call: authorize, then Allow with `scope` (omitted = all asked). */
	async function allow(scope: string | undefined) {
		const { query } = await authorize(cookie, ASKED);
		expect(query).toContain("sig=");
		const res = await post(
			"oauth2/consent",
			{ accept: true, oauth_query: query, ...(scope === undefined ? {} : { scope }) },
			cookie
		);
		return { res, body: (await res.json()) as { url?: string } };
	}

	it("Read only (subset without community:write) stores read scopes only", async () => {
		const { res, body } = await allow(consentScopeFor(ASKED, false));

		expect(res.status).toBe(200);
		expect(body.url).toContain("code=");
		expect(consentScopes()).toEqual(["community:read", "offline_access"]);
	});

	it("Read and make changes (write kept) stores both", async () => {
		const { res, body } = await allow(consentScopeFor(ASKED, true));

		expect(res.status).toBe(200);
		expect(body.url).toContain("code=");
		expect(consentScopes()).toEqual(["community:read", "community:write", "offline_access"]);
	});

	it("a scope that was never asked for is rejected", async () => {
		const { res } = await allow("community:read admin");

		expect(res.status).toBe(400);
		expect(consentScopes()).toBeUndefined();
	});
});
