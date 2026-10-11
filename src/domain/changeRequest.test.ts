import { describe, expect, it } from "vitest";
import { staleReasonText } from "./changeRequest";

describe("staleReasonText", () => {
	it("names changed info fields by their labels; custom fields by their field name", () => {
		const request = {
			kind: "info" as const,
			payload: {
				nickName: ["A", "B"] as [string, string],
				dateOfBirth: ["2000-01-01", "2000-01-02"] as [string, string],
				customFieldData: {
					cf1: { label: "Gotra", change: [null, "Kashyap"] as [null, string] },
					cf2: { label: null, change: [null, 1] as [null, number] },
				},
			},
		};
		expect(
			staleReasonText(
				{
					code: "fields_changed",
					fields: ["nickName", "dateOfBirth", "customFieldData.cf1", "customFieldData.cf2"],
				},
				request
			)
		).toBe("Changed since requested: Nickname, Date of birth, Gotra, Custom field");
	});

	it("names changed address fields by their labels", () => {
		expect(
			staleReasonText(
				{ code: "fields_changed", fields: ["line1", "postalCode", "digipin"] },
				{ kind: "address_edit", payload: {} }
			)
		).toBe("Changed since requested: Line 1, Postal code, DIGIPIN");
	});

	it("non-field reasons read as sentences", () => {
		const request = { kind: "relation_add" as const, payload: null as never };
		expect(staleReasonText({ code: "counterpart_not_active" }, request)).toBe(
			"The other profile is no longer active"
		);
	});
});
