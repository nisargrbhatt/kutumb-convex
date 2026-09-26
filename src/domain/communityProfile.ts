import { z } from "zod";
import { COMMUNITY_PROFILE_BLOOD_GROUP, COMMUNITY_PROFILE_STATUS, GENDERS } from "@/db/constants";
import type { communityProfile } from "@/db/app-schema";

export type CommunityProfileRow = typeof communityProfile.$inferSelect;

export const genderSchema = z.enum(GENDERS);
export const bloodGroupSchema = z.enum(COMMUNITY_PROFILE_BLOOD_GROUP);
export const profileStatusSchema = z.enum(COMMUNITY_PROFILE_STATUS);

// Replaced by id-keyed CustomFieldValues in issue 05.
const customFieldDataSchema = z.record(z.string(), z.unknown());

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
	customFieldData: customFieldDataSchema.nullable(),
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
	customFieldData: z.record(z.string(), z.any()).optional(),
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
		customFieldData: values.customFieldData ?? null,
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
