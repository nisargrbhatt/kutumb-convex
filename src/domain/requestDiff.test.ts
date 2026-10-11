import { describe, expect, it } from "vitest";
import { requestDiff, requestKindLabel } from "./requestDiff";

const address = {
	line1: "12 MG Road",
	line2: null,
	country: "India",
	state: "Gujarat",
	city: "Surat",
	postalCode: "395001",
	type: "home" as const,
	note: null,
	digipin: null,
};

describe("requestDiff", () => {
	it("info: changed fields as before → after, Custom Field Values by label", () => {
		expect(
			requestDiff({
				kind: "info",
				payload: {
					nickName: ["Ravi", "Ravibhai"],
					customFieldData: { def1: { label: "Gotra", change: [null, "Kashyap"] } },
				},
			})
		).toEqual({
			tone: "change",
			rows: [
				{ label: "Nick name", before: "Ravi", after: "Ravibhai" },
				{ label: "Gotra", before: null, after: "Kashyap" },
			],
		});
	});

	it("address_edit: changed fields", () => {
		expect(requestDiff({ kind: "address_edit", payload: { city: ["Surat", "Vadodara"] } })).toEqual(
			{ tone: "change", rows: [{ label: "City", before: "Surat", after: "Vadodara" }] }
		);
	});

	it("address_add / address_remove: snapshot values, add vs remove tone, no id", () => {
		const add = requestDiff({ kind: "address_add", payload: address });
		expect(add.tone).toBe("add");
		expect(add.rows).toContainEqual({ label: "Line 1", value: "12 MG Road" });
		expect(add.rows).toContainEqual({ label: "City", value: "Surat" });
		const remove = requestDiff({ kind: "address_remove", payload: { ...address, id: "a1" } });
		expect(remove.tone).toBe("remove");
		expect(remove.rows).toEqual(add.rows);
	});

	it("relation_add / relation_remove: relative name, readable type, blood relation", () => {
		const rel = { toId: "p2", toName: "Meena Patel", type: "brother_in_law" as const };
		expect(
			requestDiff({
				kind: "relation_add",
				payload: { ...rel, note: "via wife", bloodRelation: false },
			})
		).toEqual({
			tone: "add",
			rows: [
				{ label: "Relative", value: "Meena Patel" },
				{ label: "Relation", value: "Brother In Law" },
				{ label: "Blood relation", value: false },
				{ label: "Note", value: "via wife" },
			],
		});
		const remove = requestDiff({
			kind: "relation_remove",
			payload: { ...rel, id: "r1", fromId: "p1", note: null, bloodRelation: true },
		});
		expect(remove.tone).toBe("remove");
		expect(remove.rows).toEqual([
			{ label: "Relative", value: "Meena Patel" },
			{ label: "Relation", value: "Brother In Law" },
			{ label: "Blood relation", value: true },
		]);
	});

	it("create: nothing to diff (the draft itself is reviewed)", () => {
		expect(requestDiff({ kind: "create", payload: null })).toEqual({ tone: "none", rows: [] });
	});
});

describe("requestKindLabel", () => {
	it("labels every kind", () => {
		expect(requestKindLabel("create")).toBe("New profile");
		expect(requestKindLabel("info")).toBe("Info edit");
		expect(requestKindLabel("relation_add")).toBe("Add relation");
		expect(requestKindLabel("relation_remove")).toBe("Remove relation");
		expect(requestKindLabel("address_add")).toBe("Add address");
		expect(requestKindLabel("address_edit")).toBe("Edit address");
		expect(requestKindLabel("address_remove")).toBe("Remove address");
	});
});
