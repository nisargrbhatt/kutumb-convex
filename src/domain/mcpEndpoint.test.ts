import { describe, expect, it } from "vitest";
import {
	bearerChallenge,
	bearerToken,
	checkOriginAndHost,
	parseRole,
	parseScopes,
	protectedResourceMetadataUrl,
} from "./mcpEndpoint";

const OWN = "https://kutumb.example.org";

describe("bearerToken", () => {
	it.each([
		["Bearer abc.def.ghi", "abc.def.ghi"],
		["bearer abc", "abc"],
		["  Bearer   abc ", "abc"],
	])("parses %j", (header, token) => expect(bearerToken(header)).toBe(token));

	it.each([null, undefined, "", "Basic abc", "Bearer", "Bearer a b"])("rejects %j", (header) =>
		expect(bearerToken(header)).toBeNull()
	);
});

describe("parseScopes", () => {
	it("splits on whitespace", () =>
		expect(parseScopes("community:read  offline_access")).toEqual([
			"community:read",
			"offline_access",
		]));
	it("non-string → []", () => expect(parseScopes(undefined)).toEqual([]));
});

describe("bearerChallenge", () => {
	it("points at the PRM and asks for the scope", () => {
		expect(bearerChallenge(OWN)).toBe(
			`Bearer resource_metadata="${OWN}/.well-known/oauth-protected-resource/api/mcp", scope="community:read"`
		);
	});
	it("adds the error code when a token was presented", () => {
		expect(bearerChallenge(`${OWN}/`, "invalid_token")).toBe(
			`Bearer error="invalid_token", resource_metadata="${protectedResourceMetadataUrl(OWN)}", scope="community:read"`
		);
	});
});

describe("checkOriginAndHost", () => {
	const host = "kutumb.example.org";
	it("allows a missing Origin", () =>
		expect(checkOriginAndHost({ origin: null, host }, OWN)).toBe("ok"));
	it("allows our own Origin", () =>
		expect(checkOriginAndHost({ origin: OWN, host }, OWN)).toBe("ok"));
	it("rejects a foreign Origin", () =>
		expect(checkOriginAndHost({ origin: "https://evil.test", host }, OWN)).toBe("bad_origin"));
	it("rejects the opaque `null` Origin", () =>
		expect(checkOriginAndHost({ origin: "null", host }, OWN)).toBe("bad_origin"));
	it("rejects a wrong Host", () =>
		expect(checkOriginAndHost({ origin: null, host: "evil.test" }, OWN)).toBe("bad_host"));
	it("rejects a missing Host", () =>
		expect(checkOriginAndHost({ origin: null, host: null }, OWN)).toBe("bad_host"));
	it("compares host including port", () => {
		expect(
			checkOriginAndHost({ origin: null, host: "localhost:3000" }, "http://localhost:3000")
		).toBe("ok");
		expect(
			checkOriginAndHost({ origin: null, host: "localhost:4000" }, "http://localhost:3000")
		).toBe("bad_host");
	});
});

describe("parseRole", () => {
	it.each([
		["owner", "owner"],
		["member", "member"],
		["member,admin", "admin"],
		["admin, owner", "owner"],
	])("%j → %s", (raw, role) => expect(parseRole(raw)).toBe(role));
	it("unknown → null", () => expect(parseRole("superuser")).toBeNull());
});
