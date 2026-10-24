import { describe, expect, it } from "vitest";
import type { CommunityProfileInput } from "./communityProfile";
import type { CustomFieldDefinition } from "./customFields";
import { AppError } from "./errors";
import {
	addressKey,
	addressToInput,
	createProfileToInput,
	patchAddressToInput,
	patchProfileToInput,
} from "./mcpWriteInput";

const DEFS: CustomFieldDefinition[] = [
	{ id: "f1", label: "Gotra", type: "text" },
	{ id: "f2", label: "Height", type: "number" },
	{ id: "f3", label: "Vegetarian", type: "boolean" },
	{ id: "f4", label: "Anniversary", type: "date" },
];

const CURRENT: CommunityProfileInput = {
	firstName: "Asha",
	middleName: "K",
	lastName: "Patel",
	nickName: null,
	gender: "female",
	email: "asha@x.test",
	bloodGroup: "A+",
	mobileNumber: "+91 99",
	dateOfBirth: "1990-01-02T00:00:00.000Z",
	dateOfDeath: null,
	customFieldData: { f1: "Kashyap", gone: "orphan" },
};

const invalid = (fn: () => unknown) => {
	try {
		fn();
	} catch (e) {
		expect(e).toBeInstanceOf(AppError);
		expect((e as AppError).kind).toBe("Invalid");
		return (e as AppError).message;
	}
	throw new Error("expected Invalid");
};

describe("createProfileToInput", () => {
	it("fills optional core fields with null and converts days to stored ISO", () => {
		expect(
			createProfileToInput(
				{ firstName: " Asha ", lastName: "Patel", dateOfBirth: "1990-01-02" },
				DEFS
			)
		).toEqual({
			firstName: "Asha",
			middleName: null,
			lastName: "Patel",
			nickName: null,
			gender: null,
			email: null,
			bloodGroup: null,
			mobileNumber: null,
			dateOfBirth: "1990-01-02T00:00:00.000Z",
			dateOfDeath: null,
			customFieldData: null,
		});
	});

	it("resolves custom fields by id or label with strict types", () => {
		const out = createProfileToInput(
			{
				firstName: "A",
				lastName: "B",
				customFields: [
					{ field: "gotra", value: "Kashyap" },
					{ field: "f2", value: 172.5 },
					{ field: "Vegetarian", value: true },
					{ field: "Anniversary", value: "2010-06-15" },
				],
			},
			DEFS
		);
		expect(out.customFieldData).toEqual({
			f1: "Kashyap",
			f2: 172.5,
			f3: true,
			f4: "2010-06-15T00:00:00.000Z",
		});
	});

	it("unknown field → Invalid listing the valid fields and their types", () => {
		const msg = invalid(() =>
			createProfileToInput(
				{ firstName: "A", lastName: "B", customFields: [{ field: "Hobby", value: "x" }] },
				DEFS
			)
		);
		expect(msg).toContain("Hobby");
		expect(msg).toContain("Height (id f2, number)");
	});

	it.each([
		["Height", "tall", "number"],
		["Gotra", 5, "text"],
		["Vegetarian", "yes", "boolean"],
		["Anniversary", "15/06/2010", "date"],
		["Anniversary", "2010-02-30", "date"],
	])("%s = %j → Invalid naming the expected %s", (field, value, type) => {
		const msg = invalid(() =>
			createProfileToInput(
				{ firstName: "A", lastName: "B", customFields: [{ field, value }] },
				DEFS
			)
		);
		expect(msg).toContain(type);
	});

	it("null value is not a value on create (nothing to clear)", () => {
		const out = createProfileToInput(
			{ firstName: "A", lastName: "B", customFields: [{ field: "Gotra", value: null }] },
			DEFS
		);
		expect(out.customFieldData).toBeNull();
	});

	it("over-long text, a field given twice, bad dates and bad email → Invalid", () => {
		expect(
			invalid(() =>
				createProfileToInput(
					{
						firstName: "A",
						lastName: "B",
						customFields: [{ field: "Gotra", value: "x".repeat(501) }],
					},
					DEFS
				)
			)
		).toContain("500");
		expect(
			invalid(() =>
				createProfileToInput(
					{
						firstName: "A",
						lastName: "B",
						customFields: [
							{ field: "Gotra", value: "a" },
							{ field: "f1", value: "b" },
						],
					},
					DEFS
				)
			)
		).toContain("twice");
		expect(
			invalid(() =>
				createProfileToInput({ firstName: "A", lastName: "B", dateOfBirth: "02/01/1990" }, DEFS)
			)
		).toContain("dateOfBirth");
		expect(
			invalid(() => createProfileToInput({ firstName: "A", lastName: "B", email: "nope" }, DEFS))
		).toContain("email");
	});
});

describe("patchProfileToInput", () => {
	it("absent keys keep the current value; the stored ISO date round-trips", () => {
		const out = patchProfileToInput(CURRENT, { nickName: "Ashu" }, DEFS);
		expect(out).toEqual({ ...CURRENT, nickName: "Ashu" });
	});

	it("null clears optional fields, including dates", () => {
		const out = patchProfileToInput(CURRENT, { middleName: null, dateOfBirth: null }, DEFS);
		expect(out).toMatchObject({ middleName: null, dateOfBirth: null });
	});

	it("firstName / lastName cannot be cleared", () => {
		expect(invalid(() => patchProfileToInput(CURRENT, { firstName: null }, DEFS))).toContain(
			"firstName"
		);
	});

	it("customFields patch: set, overwrite, clear with null; unlisted and orphan values kept", () => {
		const out = patchProfileToInput(
			CURRENT,
			{
				customFields: [
					{ field: "Height", value: 180 },
					{ field: "Gotra", value: null },
				],
			},
			DEFS
		);
		expect(out.customFieldData).toEqual({ f2: 180, gone: "orphan" });
	});

	it("an unknown custom field is Invalid even in a patch", () => {
		expect(
			invalid(() =>
				patchProfileToInput(CURRENT, { customFields: [{ field: "Nope", value: 1 }] }, DEFS)
			)
		).toContain("Valid fields");
	});
});

const ADDRESS = {
	line1: " 12 Park Street ",
	city: "Surat",
	state: "Gujarat",
	country: "India",
	postalCode: "395001",
};

describe("addressToInput / patchAddressToInput / addressKey", () => {
	it("trims, nulls unset or blank optionals", () => {
		expect(addressToInput({ ...ADDRESS, line2: "  ", note: "n" })).toEqual({
			line1: "12 Park Street",
			line2: null,
			city: "Surat",
			state: "Gujarat",
			country: "India",
			postalCode: "395001",
			type: null,
			note: "n",
			digipin: null,
		});
	});

	it("a blank required field is Invalid naming it", () => {
		expect(invalid(() => addressToInput({ ...ADDRESS, city: " " }))).toContain("City");
	});

	it("patch keeps absent, clears null, replaces given; required stay required", () => {
		const current = addressToInput({ ...ADDRESS, line2: "Flat 4", note: "old", type: "home" });
		expect(patchAddressToInput(current, { city: "Vadodara", line2: null })).toEqual({
			...current,
			city: "Vadodara",
			line2: null,
		});
		expect(invalid(() => patchAddressToInput(current, { postalCode: "" }))).toContain("Postal");
	});

	it("key ignores case and spacing of line1, city, postal code only", () => {
		const a = addressToInput(ADDRESS);
		const b = addressToInput({ ...ADDRESS, line1: "12  park STREET", city: " surat", note: "x" });
		expect(addressKey(a)).toBe(addressKey(b));
		expect(addressKey(a)).not.toBe(addressKey({ ...a, postalCode: "395002" }));
	});
});
