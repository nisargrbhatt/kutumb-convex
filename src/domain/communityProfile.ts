import { z } from "zod";
import {
	COMMUNITY_PROFILE_BLOOD_GROUP,
	COMMUNITY_PROFILE_STATUS,
	GENDERS,
	ORGANIZATION_ROLES,
} from "@/db/constants";
import type { communityProfile } from "@/db/app-schema";
import { customFieldValuesSchema, toCustomFieldValues } from "@/domain/customFields";
import type { Actor } from "@/domain/permission";

export type CommunityProfileRow = typeof communityProfile.$inferSelect;

export const genderSchema = z.enum(GENDERS);
export const bloodGroupSchema = z.enum(COMMUNITY_PROFILE_BLOOD_GROUP);
export const profileStatusSchema = z.enum(COMMUNITY_PROFILE_STATUS);

const nullableText = z.string().trim().min(1).nullable();

/**
 * Wire shape for create/update. Every key is required and optional columns are `null` when
 * cleared, so `update().set(input)` writes every column — nothing silently skipped.
 */
export const communityProfileInput = z.object({
	firstName: z.string().trim().min(1, "First name is required"),
	middleName: nullableText,
	lastName: z.string().trim().min(1, "Last name is required"),
	nickName: nullableText,
	gender: genderSchema.nullable(),
	email: z.email().nullable(),
	bloodGroup: bloodGroupSchema.nullable(),
	mobileNumber: nullableText,
	dateOfBirth: z.iso.datetime().nullable(),
	dateOfDeath: z.iso.datetime().nullable(),
	customFieldData: customFieldValuesSchema.nullable(),
});
export type CommunityProfileInput = z.infer<typeof communityProfileInput>;

/** react-hook-form shape: controlled inputs hold `""`, pickers hold `Date`. */
export const communityProfileFormSchema = z.object({
	firstName: z.string().trim().min(1, "First name is required"),
	middleName: z.string().optional(),
	lastName: z.string().trim().min(1, "Last name is required"),
	nickName: z.string().optional(),
	gender: genderSchema.optional(),
	email: z.email().or(z.literal("")).optional(),
	bloodGroup: bloodGroupSchema.optional(),
	mobileNumber: z.string().optional(),
	dateOfBirth: z.date().optional(),
	dateOfDeath: z.date().optional(),
	// Keyed by definition id; inputs may hold `undefined`/`""` until `toInput` strips them.
	customFieldData: z.record(z.string(), z.unknown()).optional(),
});
export type CommunityProfileFormValues = z.infer<typeof communityProfileFormSchema>;

type ProfileFields = Pick<
	CommunityProfileRow,
	| "firstName"
	| "middleName"
	| "lastName"
	| "nickName"
	| "gender"
	| "email"
	| "bloodGroup"
	| "mobileNumber"
	| "dateOfBirth"
	| "dateOfDeath"
	| "customFieldData"
>;

export function toFormValues(
	row: ProfileFields | null | undefined,
	fallback: Partial<CommunityProfileFormValues> = {}
): CommunityProfileFormValues {
	if (!row) {
		return {
			firstName: "",
			middleName: "",
			lastName: "",
			nickName: "",
			email: "",
			mobileNumber: "",
			customFieldData: {},
			...fallback,
		};
	}
	return {
		firstName: row.firstName,
		middleName: row.middleName ?? "",
		lastName: row.lastName,
		nickName: row.nickName ?? "",
		gender: row.gender ?? undefined,
		email: row.email ?? "",
		bloodGroup: row.bloodGroup ?? undefined,
		mobileNumber: row.mobileNumber ?? "",
		dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
		dateOfDeath: row.dateOfDeath ? new Date(row.dateOfDeath) : undefined,
		customFieldData: row.customFieldData ?? {},
	};
}

const blankToNull = (v: string | null | undefined) => {
	const t = v?.trim();
	return t ? t : null;
};

export function toInput(values: CommunityProfileFormValues): CommunityProfileInput {
	return {
		firstName: values.firstName.trim(),
		middleName: blankToNull(values.middleName),
		lastName: values.lastName.trim(),
		nickName: blankToNull(values.nickName),
		gender: values.gender ?? null,
		email: blankToNull(values.email),
		bloodGroup: values.bloodGroup ?? null,
		mobileNumber: blankToNull(values.mobileNumber),
		dateOfBirth: values.dateOfBirth?.toISOString() ?? null,
		dateOfDeath: values.dateOfDeath?.toISOString() ?? null,
		customFieldData: toCustomFieldValues(values.customFieldData),
	};
}

export const MEMBER_FILTER_DEFAULTS = {
	search: "",
	status: "",
	gender: "",
	page: 1,
	pageSize: 10,
} as const;

/** Members list filter: URL search params (lenient via `.catch`) and server validator in one. */
export const memberFilterSchema = z.object({
	search: z.string().default(MEMBER_FILTER_DEFAULTS.search).catch(MEMBER_FILTER_DEFAULTS.search),
	status: profileStatusSchema
		.or(z.literal(""))
		.default(MEMBER_FILTER_DEFAULTS.status)
		.catch(MEMBER_FILTER_DEFAULTS.status),
	gender: genderSchema
		.or(z.literal(""))
		.default(MEMBER_FILTER_DEFAULTS.gender)
		.catch(MEMBER_FILTER_DEFAULTS.gender),
	page: z
		.number()
		.int()
		.min(1)
		.default(MEMBER_FILTER_DEFAULTS.page)
		.catch(MEMBER_FILTER_DEFAULTS.page),
	pageSize: z
		.number()
		.int()
		.min(1)
		.max(100)
		.default(MEMBER_FILTER_DEFAULTS.pageSize)
		.catch(MEMBER_FILTER_DEFAULTS.pageSize),
});
export type MemberFilter = z.infer<typeof memberFilterSchema>;

/**
 * Members list status filter options (besides "All"). Owner/admin: every status. Plain member:
 * `draft` only — reads as "my drafts", since they see no one else's; `inactive` is hidden from them.
 */
export function memberStatusFilterOptions(actor: Actor): z.infer<typeof profileStatusSchema>[] {
	return actor.role === ORGANIZATION_ROLES.member
		? [COMMUNITY_PROFILE_STATUS.draft]
		: Object.values(COMMUNITY_PROFILE_STATUS);
}

export const MAX_CUSTOM_FIELD_FILTERS = 5;

export const CUSTOM_FIELD_FILTER_OPS = [
	"eq",
	"contains",
	"gt",
	"gte",
	"lt",
	"lte",
	"before",
	"after",
	"isSet",
	"isNotSet",
] as const;

/**
 * One custom field condition. Allowed ops depend on the field's type, and the value must match it;
 * both are checked against the live definitions (`Invalid` with a hint), not here.
 */
export const customFieldFilterSchema = z.object({
	field: z.string().min(1).describe("Custom field id or exact label (see list_custom_fields)."),
	op: z
		.enum(CUSTOM_FIELD_FILTER_OPS)
		.describe(
			"text: eq (case-insensitive), contains. number: eq, gt, gte, lt, lte. date: eq, before, after (calendar day). boolean: eq. Any type: isSet, isNotSet."
		),
	value: z
		.union([z.string(), z.number(), z.boolean()])
		.optional()
		.describe(
			"Comparison value: text string, JSON number, true/false, or YYYY-MM-DD for date. Omit for isSet/isNotSet."
		),
});
export type CustomFieldFilter = z.infer<typeof customFieldFilterSchema>;

/**
 * Profile filter for AI Clients, shared by `search_profiles` and `count_profiles`. Every key is
 * optional and all given keys are ANDed. Days are `YYYY-MM-DD`; the predicate builder checks them
 * and raises `Invalid` with a hint. Validated shape only: SQL lives in
 * `domain/queries/profileFilters.ts`.
 */
export const profileFilterSchema = z.object({
	query: z
		.string()
		.trim()
		.optional()
		.describe("Name text; every word must match part of a first/middle/last/nick name."),
	gender: genderSchema.optional().describe("Only profiles with this gender."),
	bloodGroup: z
		.array(bloodGroupSchema)
		.optional()
		.describe("Only profiles whose blood group is any of these."),
	bornOnOrAfter: z.string().optional().describe("Date of birth on or after this day, YYYY-MM-DD."),
	bornOnOrBefore: z
		.string()
		.optional()
		.describe("Date of birth on or before this day, YYYY-MM-DD."),
	city: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Has an address in this city (case-insensitive, exact)."),
	state: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Has an address in this state (case-insensitive, exact)."),
	country: z
		.string()
		.trim()
		.min(1)
		.optional()
		.describe("Has an address in this country (case-insensitive, exact)."),
	living: z
		.boolean()
		.optional()
		.describe(
			"true: only living people (no date of death). false: only deceased. Omit to include both. Pass true for questions about who is alive or about today."
		),
	customFieldFilters: z
		.array(customFieldFilterSchema)
		.optional()
		.describe(`Custom field conditions, all must hold. At most ${MAX_CUSTOM_FIELD_FILTERS}.`),
});
export type ProfileFilter = z.infer<typeof profileFilterSchema>;

/** AI Client search tool input: the shared filter plus paging. `limit` is clamped again server-side. */
export const searchProfilesInput = profileFilterSchema.extend({
	limit: z.number().int().min(1).max(100).default(25).describe("Page size, 1-100. Default 25."),
	cursor: z.string().optional().describe("`nextCursor` from the previous page."),
});
export type SearchProfilesInput = z.infer<typeof searchProfilesInput>;

/** Core dimensions `count_profiles` can group by. */
export const COUNT_CORE_DIMENSIONS = [
	"gender",
	"bloodGroup",
	"living",
	"city",
	"state",
	"country",
	"birthDecade",
] as const;

/** `count_profiles` input: the shared filter plus one optional dimension to group by. */
export const countProfilesInput = profileFilterSchema.extend({
	groupBy: z
		.union([
			z.object({ core: z.enum(COUNT_CORE_DIMENSIONS).describe("A built-in dimension.") }),
			z.object({
				field: z
					.string()
					.min(1)
					.describe("Custom field id or exact label; text and boolean fields only."),
			}),
		])
		.optional()
		.describe(
			"Split the count by one dimension: {core: ...} or {field: ...}. Omit for a plain total."
		),
});
export type CountProfilesInput = z.infer<typeof countProfilesInput>;

type NameParts = Pick<CommunityProfileRow, "firstName" | "lastName"> & {
	middleName?: string | null;
};

export const fullName = (p: NameParts) =>
	[p.firstName, p.middleName, p.lastName]
		.map((s) => s?.trim())
		.filter(Boolean)
		.join(" ");

/** First letter of first + last name, code-point aware; `?` when both are blank. */
export const initials = (p: Pick<NameParts, "firstName" | "lastName">) => {
	const first = Array.from(p.firstName.trim())[0] ?? "";
	const last = Array.from(p.lastName.trim())[0] ?? "";
	return (first + last).toUpperCase() || "?";
};
