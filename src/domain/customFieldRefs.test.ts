import { describe, expect, it } from "vitest";
import type { CustomFieldDefinition } from "./customFields";
import { isAppError } from "./errors";
import { resolveFieldRef } from "./customFieldRefs";

const defs: CustomFieldDefinition[] = [
	{ id: "f1", label: "Gotra", type: "text" },
	{ id: "f2", label: "Height", type: "number" },
	{ id: "f3", label: "Pet", type: "text" },
	{ id: "f4", label: "pet", type: "boolean" },
];

const failure = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		if (isAppError(e)) return e;
		throw e;
	}
	throw new Error("expected throw");
};

describe("resolveFieldRef", () => {
	it("resolves by id", () => {
		expect(resolveFieldRef(defs, "f2")).toEqual(defs[1]);
	});

	it("resolves by label, ignoring case and surrounding spaces", () => {
		expect(resolveFieldRef(defs, "  gOTRA ")).toEqual(defs[0]);
	});

	it("id wins over a label that equals it", () => {
		const tricky: CustomFieldDefinition[] = [
			{ id: "a", label: "b", type: "text" },
			{ id: "b", label: "other", type: "text" },
		];
		expect(resolveFieldRef(tricky, "b").id).toBe("b");
	});

	it("ambiguous label → Invalid listing the matching ids", () => {
		const e = failure(() => resolveFieldRef(defs, "PET"));
		expect(e.kind).toBe("Invalid");
		expect(e.message).toContain("f3");
		expect(e.message).toContain("f4");
		expect(e.message).not.toContain("f1");
	});

	it("an id picks one of two same-label definitions", () => {
		expect(resolveFieldRef(defs, "f4").type).toBe("boolean");
	});

	it("unknown or deleted → Invalid listing the current fields", () => {
		const e = failure(() => resolveFieldRef(defs, "Shoe size"));
		expect(e.kind).toBe("Invalid");
		expect(e.message).toContain('"Shoe size"');
		for (const d of defs) {
			expect(e.message).toContain(d.id);
			expect(e.message).toContain(d.label);
		}
	});

	it("no definitions at all → Invalid saying there are none", () => {
		const e = failure(() => resolveFieldRef([], "x"));
		expect(e.kind).toBe("Invalid");
		expect(e.message).toContain("no custom fields");
	});
});
