import { describe, expect, it } from "vitest";
import {
	EMPTY_VALUE,
	customFieldTypeSchema,
	customFieldValuesSchema,
	formatCustomFieldValue,
	toCustomFieldValues,
	valuesForDefs,
	type CustomFieldDefinition,
} from "./customFields";

const def = (type: CustomFieldDefinition["type"], id: string = type): CustomFieldDefinition => ({
	id,
	label: `${type} label`,
	type,
});

describe("customFieldTypeSchema", () => {
	it("accepts known, rejects unknown", () => {
		expect(customFieldTypeSchema.safeParse("date").success).toBe(true);
		expect(customFieldTypeSchema.safeParse("email").success).toBe(false);
	});
});

describe("customFieldValuesSchema", () => {
	it("accepts scalar values", () => {
		expect(customFieldValuesSchema.safeParse({ a: "x", b: 1, c: true, d: null }).success).toBe(
			true
		);
	});

	it("rejects nested values", () => {
		expect(customFieldValuesSchema.safeParse({ a: { b: 1 } }).success).toBe(false);
	});
});

describe("formatCustomFieldValue", () => {
	it.each(["text", "number", "date", "boolean"] as const)("%s: missing → dash", (type) => {
		expect(formatCustomFieldValue(def(type), null)).toBe(EMPTY_VALUE);
		expect(formatCustomFieldValue(def(type), undefined)).toBe(EMPTY_VALUE);
		expect(formatCustomFieldValue(def(type), "  ")).toBe(EMPTY_VALUE);
	});

	it("text as stored", () => {
		expect(formatCustomFieldValue(def("text"), "Surat")).toBe("Surat");
	});

	it("boolean → Yes/No", () => {
		expect(formatCustomFieldValue(def("boolean"), true)).toBe("Yes");
		expect(formatCustomFieldValue(def("boolean"), false)).toBe("No");
	});

	it("number → locale string", () => {
		expect(formatCustomFieldValue(def("number"), 1234567)).toBe((1234567).toLocaleString());
		expect(formatCustomFieldValue(def("number"), 0)).toBe("0");
	});

	it("date → dd MMM yyyy", () => {
		expect(formatCustomFieldValue(def("date"), "2024-03-05T10:00:00.000Z")).toBe("05 Mar 2024");
	});

	it("date honours dateFormat", () => {
		expect(
			formatCustomFieldValue(def("date"), "2024-03-05T10:00:00.000Z", { dateFormat: "yyyy" })
		).toBe("2024");
	});

	it("invalid date string shown as stored", () => {
		expect(formatCustomFieldValue(def("date"), "not a date")).toBe("not a date");
	});

	it("mismatched shape shown as stored", () => {
		expect(formatCustomFieldValue(def("boolean"), "yes")).toBe("yes");
		expect(formatCustomFieldValue(def("number"), "12")).toBe("12");
	});
});

describe("valuesForDefs", () => {
	const defs = [def("text", "b"), def("number", "a")];

	it("orders by defs and drops orphan ids", () => {
		const result = valuesForDefs(defs, { a: 1, b: "x", gone: "orphan" });
		expect(result.map((r) => [r.def.id, r.value])).toEqual([
			["b", "x"],
			["a", 1],
		]);
	});

	it("missing values → null", () => {
		expect(valuesForDefs(defs, null).map((r) => r.value)).toEqual([null, null]);
	});

	it("keys by id so a relabelled def keeps its value", () => {
		const [renamed] = valuesForDefs([{ ...defs[0], label: "New label" }], { b: "kept" });
		expect(renamed.value).toBe("kept");
	});
});

describe("toCustomFieldValues", () => {
	it("drops blank, undefined and non-scalar entries", () => {
		expect(
			toCustomFieldValues({ a: "x", b: "", c: undefined, d: false, e: 0, f: { g: 1 }, h: null })
		).toEqual({ a: "x", d: false, e: 0 });
	});

	it("null → empty", () => {
		expect(toCustomFieldValues(null)).toEqual({});
	});
});
