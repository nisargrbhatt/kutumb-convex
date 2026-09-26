import { describe, expect, it } from "vitest";
import {
	communityProfileInput,
	fullName,
	initials,
	memberFilterSchema,
	toFormValues,
	toInput,
	type CommunityProfileFormValues,
} from "./communityProfile";

const base: CommunityProfileFormValues = {
	firstName: "Asha",
	middleName: "",
	lastName: "Patel",
	nickName: "  ",
	email: "",
	mobileNumber: "",
	customFieldData: {},
};

describe("toInput", () => {
	it('maps "" / whitespace / undefined to null', () => {
		const input = toInput(base);
		expect(input.middleName).toBeNull();
		expect(input.nickName).toBeNull();
		expect(input.email).toBeNull();
		expect(input.mobileNumber).toBeNull();
		expect(input.gender).toBeNull();
		expect(input.bloodGroup).toBeNull();
		expect(input.dateOfBirth).toBeNull();
		expect(input.dateOfDeath).toBeNull();
	});

	it("emits every key so update().set() clears columns", () => {
		expect(Object.keys(toInput(base)).sort()).toEqual(
			Object.keys(communityProfileInput.shape).sort()
		);
	});

	it("maps Date to ISO", () => {
		const d = new Date("1990-05-17T00:00:00.000Z");
		expect(toInput({ ...base, dateOfBirth: d }).dateOfBirth).toBe("1990-05-17T00:00:00.000Z");
	});

	it("output passes the server schema", () => {
		const input = toInput({
			...base,
			email: "a@b.co",
			gender: "female",
			bloodGroup: "O+",
			dateOfBirth: new Date("1990-05-17T00:00:00.000Z"),
		});
		expect(communityProfileInput.safeParse(input).success).toBe(true);
		expect(communityProfileInput.safeParse(toInput(base)).success).toBe(true);
	});

	it("round-trips through toFormValues", () => {
		const input = toInput({
			...base,
			middleName: "R",
			email: "a@b.co",
			gender: "female",
			bloodGroup: "AB-",
			dateOfBirth: new Date("1990-05-17T00:00:00.000Z"),
			customFieldData: { x: "1" },
		});
		expect(toInput(toFormValues({ ...input, dateOfDeath: null }))).toEqual(input);
	});
});

describe("toFormValues", () => {
	it("null row → blank controlled values + fallback", () => {
		const v = toFormValues(null, { email: "me@x.io", gender: "male" });
		expect(v.firstName).toBe("");
		expect(v.middleName).toBe("");
		expect(v.email).toBe("me@x.io");
		expect(v.gender).toBe("male");
	});
});

describe("memberFilterSchema", () => {
	it("fills defaults", () => {
		expect(memberFilterSchema.parse({})).toEqual({
			search: "",
			status: "",
			gender: "",
			page: 1,
			pageSize: 10,
		});
	});

	it("catches junk URL values", () => {
		expect(memberFilterSchema.parse({ status: "bogus", page: 0, pageSize: 999 })).toMatchObject({
			status: "",
			page: 1,
			pageSize: 10,
		});
	});

	it("keeps valid values", () => {
		expect(memberFilterSchema.parse({ status: "draft", gender: "other", page: 3 })).toMatchObject({
			status: "draft",
			gender: "other",
			page: 3,
		});
	});
});

describe("fullName", () => {
	it("skips missing / blank middle", () => {
		expect(fullName({ firstName: "Asha", lastName: "Patel" })).toBe("Asha Patel");
		expect(fullName({ firstName: "Asha", middleName: " ", lastName: "Patel" })).toBe("Asha Patel");
		expect(fullName({ firstName: "Asha", middleName: null, lastName: "Patel" })).toBe("Asha Patel");
	});

	it("includes middle", () => {
		expect(fullName({ firstName: "Asha", middleName: "R", lastName: "Patel" })).toBe(
			"Asha R Patel"
		);
	});
});

describe("initials", () => {
	it("first + last", () => {
		expect(initials({ firstName: "asha", lastName: "patel" })).toBe("AP");
	});

	it("handles unicode / astral chars", () => {
		expect(initials({ firstName: "Élodie", lastName: "Øster" })).toBe("ÉØ");
		expect(initials({ firstName: "आशा", lastName: "पटेल" })).toBe("आप");
		expect(initials({ firstName: "𝒜da", lastName: "Lee" })).toBe("𝒜L");
	});

	it("? when blank", () => {
		expect(initials({ firstName: " ", lastName: "" })).toBe("?");
	});
});
