import { describe, expect, it } from "vitest";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { formatRelationType, relationTypeSchema } from "./relation";

describe("relationTypeSchema", () => {
	it.each(Object.values(COMMUNITY_RELATION_TYPE))("accepts %s", (t) => {
		expect(relationTypeSchema.safeParse(t).success).toBe(true);
	});

	it("rejects unknown", () => {
		expect(relationTypeSchema.safeParse("cousin").success).toBe(false);
		expect(relationTypeSchema.safeParse("").success).toBe(false);
	});
});

describe("formatRelationType", () => {
	it("title-cases underscored types", () => {
		expect(formatRelationType("brother_in_law")).toBe("Brother In Law");
		expect(formatRelationType("wife")).toBe("Wife");
	});

	it("dashes empty", () => {
		expect(formatRelationType(null)).toBe("-");
		expect(formatRelationType("")).toBe("-");
	});
});
