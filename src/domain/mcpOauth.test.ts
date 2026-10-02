import { describe, expect, it } from "vitest";
import {
	MCP_SCOPES,
	OAUTH_RATE_LIMITS,
	ORG_PICK_TTL_MS,
	inferApplicationType,
	isOrgPickValid,
	mcpResourceUrl,
	oauthRedirectUrl,
	orgPickIdentifier,
	registrationKind,
} from "./mcpOauth";

describe("mcpResourceUrl", () => {
	it("appends /api/mcp to the origin", () => {
		expect(mcpResourceUrl("https://kutumb.example.org")).toBe("https://kutumb.example.org/api/mcp");
	});

	it("ignores trailing slashes on the origin", () => {
		expect(mcpResourceUrl("http://localhost:3000/")).toBe("http://localhost:3000/api/mcp");
	});
});

describe("registrationKind", () => {
	it("treats URL client ids as CIMD", () => {
		expect(registrationKind("https://claude.ai/oauth/client.json")).toBe("cimd");
	});

	it("treats opaque generated ids as DCR", () => {
		expect(registrationKind("aZkQ3mPLw0sT9uVx1yBcDeFgHiJkLmNo")).toBe("dcr");
	});
});

describe("org pick marker", () => {
	const now = 1_000_000;
	const row = (over: Partial<{ value: string; expiresAt: number }> = {}) => ({
		value: "org_1",
		expiresAt: now + ORG_PICK_TTL_MS,
		...over,
	});

	it("is keyed by session", () => {
		expect(orgPickIdentifier("sess_1")).not.toBe(orgPickIdentifier("sess_2"));
	});

	it("is valid for the active org before it expires", () => {
		expect(isOrgPickValid(row(), "org_1", now)).toBe(true);
	});

	it("is invalid when missing", () => {
		expect(isOrgPickValid(null, "org_1", now)).toBe(false);
	});

	it("is invalid once expired", () => {
		expect(isOrgPickValid(row({ expiresAt: now - 1 }), "org_1", now)).toBe(false);
	});

	it("is invalid if the active org changed since the pick", () => {
		expect(isOrgPickValid(row(), "org_2", now)).toBe(false);
	});

	it("is invalid with no active org", () => {
		expect(isOrgPickValid(row(), null, now)).toBe(false);
	});
});

describe("config", () => {
	it("exposes only the community:read + offline_access scopes", () => {
		expect([...MCP_SCOPES]).toEqual(["community:read", "offline_access"]);
	});

	it("limits register to 5/h and token + authorize to 30/min", () => {
		expect(OAUTH_RATE_LIMITS.register).toEqual({ window: 3600, max: 5 });
		expect(OAUTH_RATE_LIMITS.token).toEqual({ window: 60, max: 30 });
		expect(OAUTH_RATE_LIMITS.authorize).toEqual({ window: 60, max: 30 });
	});
});

describe("oauthRedirectUrl", () => {
	it("reads `url` from a better-auth redirect result", () => {
		expect(oauthRedirectUrl({ redirect: true, url: "https://app.test/cb?code=1" })).toBe(
			"https://app.test/cb?code=1"
		);
	});

	it("falls back to `redirect_uri`", () => {
		expect(oauthRedirectUrl({ redirect_uri: "https://app.test/cb?error=access_denied" })).toBe(
			"https://app.test/cb?error=access_denied"
		);
	});

	it("is null for anything else", () => {
		expect(oauthRedirectUrl(null)).toBeNull();
		expect(oauthRedirectUrl({})).toBeNull();
		expect(oauthRedirectUrl({ url: 42 })).toBeNull();
		expect(oauthRedirectUrl({ url: "" })).toBeNull();
	});
});

describe("inferApplicationType", () => {
	it("is native for http loopback redirects (any port)", () => {
		expect(inferApplicationType(["http://localhost:6274/oauth/callback"])).toBe("native");
		expect(inferApplicationType(["http://127.0.0.1:8123/cb"])).toBe("native");
		expect(inferApplicationType(["http://[::1]:9/cb"])).toBe("native");
	});

	it("is native for private-use schemes", () => {
		expect(inferApplicationType(["cursor://anysphere.cursor-mcp/oauth/callback"])).toBe("native");
	});

	it("is native when mixing loopback and private-use", () => {
		expect(inferApplicationType(["http://localhost:1/cb", "cursor://x.y/cb"])).toBe("native");
	});

	it("leaves https redirects to the web default", () => {
		expect(inferApplicationType(["https://claude.ai/api/mcp/auth_callback"])).toBeUndefined();
	});

	it("leaves a mix with https alone", () => {
		expect(inferApplicationType(["http://localhost:1/cb", "https://app.test/cb"])).toBeUndefined();
	});

	it("does not treat non-loopback http as native", () => {
		expect(inferApplicationType(["http://evil.test/cb"])).toBeUndefined();
	});

	it("is undefined for empty or unparseable input", () => {
		expect(inferApplicationType([])).toBeUndefined();
		expect(inferApplicationType(["not a url"])).toBeUndefined();
	});
});
