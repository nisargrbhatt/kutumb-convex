import { describe, expect, it } from "vitest";
import { cimdUrlRejection } from "./cimd";

const OWN = "https://kutumb.example.org";

describe("cimdUrlRejection", () => {
	it("allows a public https URL", () => {
		expect(cimdUrlRejection("https://claude.ai/oauth/client.json", OWN)).toBeNull();
	});

	it("rejects http", () => {
		expect(cimdUrlRejection("http://claude.ai/client.json", OWN)).toMatch(/https/);
	});

	it.each([
		"https://127.0.0.1/client.json",
		"https://10.0.0.5:8443/client.json",
		"https://2130706433/client.json",
		"https://0x7f.1/client.json",
		"https://[::1]/client.json",
		"https://[2001:db8::1]/client.json",
	])("rejects IP literal %s", (url) => {
		expect(cimdUrlRejection(url, OWN)).toMatch(/IP/);
	});

	it("rejects our own origin on any port or path", () => {
		expect(cimdUrlRejection("https://kutumb.example.org/api/auth/x", OWN)).toMatch(/this server/);
		expect(cimdUrlRejection("https://kutumb.example.org:8443/x", OWN)).toMatch(/this server/);
	});

	it("rejects our own host with a trailing root dot", () => {
		expect(cimdUrlRejection("https://kutumb.example.org./x", OWN)).toMatch(/this server/);
	});

	it("rejects credentials and garbage", () => {
		expect(cimdUrlRejection("https://user:pw@claude.ai/c.json", OWN)).toMatch(/credentials/);
		expect(cimdUrlRejection("not a url", OWN)).toMatch(/valid URL/);
	});
});
