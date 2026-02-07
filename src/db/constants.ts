export const GENDERS = {
	male: "male",
	female: "female",
	other: "other",
} as const;

export const ORGANIZATION_ROLES = {
	owner: "owner",
	manager: "manager",
	member: "member",
} as const;

export const COMMUNITY_PROFILE_STATUS = {
	active: "active",
	inactive: "inactive",
	draft: "draft",
} as const;

export const COMMUNITY_PROFILE_BLOOD_GROUP = {
	"A+": "A+",
	"A-": "A-",
	"B+": "B+",
	"B-": "B-",
	"AB+": "AB+",
	"AB-": "AB-",
	"O+": "O+",
	"O-": "O-",
} as const;

export const COMMUNITY_PROFILE_RELATIONSHIP = {
	single: "single",
	married: "married",
	divorced: "divorced",
	widowed: "widowed",
	"rather not say": "rather not say",
} as const;

export const COMMUNITY_ADDRESS_TYPE = {
	home: "home",
	work: "work",
	other: "other",
} as const;

export const COMMUNITY_RELATION_TYPE = {
	brother: "brother",
	brother_in_law: "brother_in_law",
	child: "child",
	father: "father",
	father_in_law: "father_in_law",
	mother: "mother",
	mother_in_law: "mother_in_law",
	sister: "sister",
	sister_in_law: "sister_in_law",
	wife: "wife",
	husband: "husband",
	uncle: "uncle",
	aunt: "aunt",
} as const;

export const CUSTOM_FIELD_TYPE = {
	text: "text",
	number: "number",
	date: "date",
	boolean: "boolean",
} as const;
