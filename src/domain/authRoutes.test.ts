import { describe, expect, it } from "vitest";
import {
	DEFAULT_POST_AUTH,
	authHref,
	isOnboardingPath,
	loginHref,
	postAuthDestination,
} from "./authRoutes";

describe("loginHref", () => {
	it("bare when nothing carried", () => {
		expect(loginHref()).toBe("/login");
		expect(loginHref({ redirectTo: "", invitation: undefined })).toBe("/login");
	});

	it("encodes redirectTo and invitation", () => {
		expect(loginHref({ redirectTo: "/members?x=1&y=2", invitation: "a b/c" })).toBe(
			"/login?redirectTo=%2Fmembers%3Fx%3D1%26y%3D2&invitation=a+b%2Fc"
		);
	});

	it("round-trips through URLSearchParams", () => {
		const href = loginHref({ redirectTo: "/onboarding/invitations", invitation: "inv_1" });
		const params = new URL(href, "http://x").searchParams;
		expect(params.get("redirectTo")).toBe("/onboarding/invitations");
		expect(params.get("invitation")).toBe("inv_1");
	});

	it("authHref targets signup too", () => {
		expect(authHref("/signup", { invitation: "i" })).toBe("/signup?invitation=i");
	});
});

describe("postAuthDestination", () => {
	it.each([
		[undefined],
		[""],
		["//evil.com"],
		["//evil.com/path"],
		["/\\evil.com"],
		["/\t/evil.com"],
		["http://evil.com"],
		["https://evil.com/dashboard"],
		["javascript:alert(1)"],
		["dashboard"],
	])("rejects %j", (redirectTo) => {
		expect(postAuthDestination({ redirectTo })).toBe(DEFAULT_POST_AUTH);
	});

	it.each([
		["/members?x=1", "/members?x=1"],
		["/onboarding/invitations", "/onboarding/invitations"],
		["/members/abc#relations", "/members/abc#relations"],
		["/", "/"],
	])("keeps %j", (redirectTo, expected) => {
		expect(postAuthDestination({ redirectTo })).toBe(expected);
	});
});

describe("isOnboardingPath", () => {
	it.each([
		["/onboarding", true],
		["/onboarding/create", true],
		["/onboarding/invitations", true],
		["/onboardingx", false],
		["/dashboard", false],
		["/", false],
	])("%s → %s", (path, expected) => {
		expect(isOnboardingPath(path)).toBe(expected);
	});
});
