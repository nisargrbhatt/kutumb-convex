import { describe, expect, it } from "vitest";
import { MEMBER_FILTER_DEFAULTS } from "@/domain/communityProfile";
import { accountKeys, addressKeys, fieldKeys, orgKeys, profileKeys, relationKeys } from "./keys";

const ORG = "org_1";
const factories = { profileKeys, relationKeys, addressKeys, fieldKeys, orgKeys };

// Sample args per factory name; orgId is always the first arg.
const ARGS: Record<string, unknown[]> = {
	list: [MEMBER_FILTER_DEFAULTS],
	detail: ["p1"],
	forRelation: ["p1"],
	graph: ["p1", 2],
	search: ["q"],
};

describe("org-scoped key factories", () => {
	for (const [name, keys] of Object.entries(factories)) {
		const domain = keys.all(ORG)[0];

		for (const [fn, make] of Object.entries(keys)) {
			it(`${name}.${fn} starts with [${domain}, orgId]`, () => {
				const key = (make as (...a: unknown[]) => readonly unknown[])(ORG, ...(ARGS[fn] ?? []));
				expect(key.slice(0, 2)).toEqual([domain, ORG]);
			});
		}
	}

	it("domains are distinct", () => {
		const domains = Object.values(factories).map((k) => k.all(ORG)[0]);
		expect(new Set(domains).size).toBe(domains.length);
	});

	it("different orgs never share a key", () => {
		expect(profileKeys.mine("a")).not.toEqual(profileKeys.mine("b"));
	});
});

describe("accountKeys", () => {
	it("is user-scoped", () => {
		expect(accountKeys.organizationCount("u1").slice(0, 2)).toEqual(["account", "u1"]);
	});
});
