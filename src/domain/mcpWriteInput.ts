/**
 * MCP edge input for profile writes: AI-Client-friendly shapes (calendar days, `[{field, value}]`
 * custom fields, partial patches) → the domain's full `CommunityProfileInput`. Pure; the seam
 * (`makeProfileChanges`) stays unchanged. Failures are `Invalid` with a message the model can act on.
 */
import { z } from "zod";
import { addressInput, addressTypeSchema } from "./address";
import { dayToStoredIso } from "./calendarDay";
import { bloodGroupSchema, communityProfileInput, genderSchema } from "./communityProfile";
import type { CommunityProfileInput } from "./communityProfile";
import { describeField, resolveFieldRef } from "./customFieldRefs";
import {
	CUSTOM_FIELD_TEXT_MAX,
	type CustomFieldDefinition,
	type CustomFieldValues,
} from "./customFields";
import { AppError } from "./errors";
import { CUSTOM_FIELD_LIMIT } from "./limits";
import type { AddressInput } from "./profileChanges";
import { relationTypeSchema } from "./relation";

const customFieldPatch = z
	.array(
		z.object({
			field: z.string().min(1).describe("Custom field id or exact label (see list_custom_fields)."),
			value: z
				.union([z.string(), z.number(), z.boolean(), z.null()])
				.describe(
					`text: string (max ${CUSTOM_FIELD_TEXT_MAX} chars). number: a number. boolean: true/false. date: 'YYYY-MM-DD'. null clears the value.`
				),
		})
	)
	.max(CUSTOM_FIELD_LIMIT);
export type CustomFieldPatch = z.infer<typeof customFieldPatch>;

const optionalText = (what: string) => z.string().nullable().optional().describe(what);
const optionalDay = (what: string) =>
	z.string().nullable().optional().describe(`${what} as YYYY-MM-DD`);

const optionalCoreFields = {
	middleName: optionalText("Middle name"),
	nickName: optionalText("Nick name"),
	gender: genderSchema.nullable().optional(),
	email: optionalText("Email address"),
	bloodGroup: bloodGroupSchema.nullable().optional(),
	mobileNumber: optionalText("Mobile number"),
	dateOfBirth: optionalDay("Date of birth"),
	dateOfDeath: optionalDay("Date of death"),
	customFields: customFieldPatch.optional(),
};

export const createProfileInput = z.object({
	firstName: z.string().describe("First name"),
	lastName: z.string().describe("Last name"),
	...optionalCoreFields,
	self: z
		.boolean()
		.optional()
		.describe(
			"true = this is the signed-in member's own profile (only when whoami.profileId is null). Default false: a profile of someone else."
		),
	allowDuplicate: z
		.boolean()
		.optional()
		.describe(
			"Only set true after the user confirmed that a possible_duplicate candidate is a different person."
		),
});
export type CreateProfileInput = z.infer<typeof createProfileInput>;

export const updateProfileInput = z.object({
	profileId: z.string().min(1).describe("Community Profile id"),
	expectedVersion: z
		.number()
		.int()
		.min(0)
		.describe("The profile's `version` from get_profile. A mismatch fails with Stale."),
	firstName: z.string().optional().describe("First name (cannot be cleared)"),
	lastName: z.string().optional().describe("Last name (cannot be cleared)"),
	...optionalCoreFields,
});
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

/** Fields a patch may touch; `undefined` = leave as is, `null` = clear. */
export type ProfilePatch = Partial<
	Pick<
		CreateProfileInput,
		| "middleName"
		| "nickName"
		| "gender"
		| "email"
		| "bloodGroup"
		| "mobileNumber"
		| "dateOfBirth"
		| "dateOfDeath"
		| "customFields"
	>
> & { firstName?: string | null; lastName?: string | null };

const invalid = (message: string) => new AppError("Invalid", message);

const blankToNull = (v: string | null | undefined): string | null => v?.trim() || null;

function dayToIso(field: string, day: string | null | undefined): string | null | undefined {
	if (day === undefined) return undefined;
	const text = day?.trim();
	if (!text) return null;
	const iso = dayToStoredIso(text);
	if (!iso) throw invalid(`${field} must be a real calendar day as YYYY-MM-DD; got "${text}".`);
	return iso;
}

/** One typed value → stored form, or `Invalid` naming the field, its type and what was sent. */
function toStoredValue(def: CustomFieldDefinition, value: string | number | boolean) {
	const mismatch = (expected: string) =>
		invalid(
			`Custom field ${describeField(def)} takes ${expected}; got ${JSON.stringify(value)} (${typeof value}).`
		);
	switch (def.type) {
		case "text":
			if (typeof value !== "string" || !value.trim()) throw mismatch("a non-empty text string");
			if (value.length > CUSTOM_FIELD_TEXT_MAX) {
				throw invalid(
					`Custom field ${describeField(def)} text can be at most ${CUSTOM_FIELD_TEXT_MAX} characters.`
				);
			}
			return value;
		case "number":
			if (typeof value !== "number" || !Number.isFinite(value)) throw mismatch("a number");
			return value;
		case "boolean":
			if (typeof value !== "boolean") throw mismatch("true or false");
			return value;
		case "date": {
			const iso = typeof value === "string" ? dayToStoredIso(value.trim()) : null;
			if (!iso) throw mismatch("a real calendar day as YYYY-MM-DD");
			return iso;
		}
	}
}

/** Patch applied onto `base` (id-keyed). `null` removes a value; unlisted and orphan keys stay. */
function applyCustomFields(
	defs: CustomFieldDefinition[],
	base: CustomFieldValues | null,
	patch: CustomFieldPatch | undefined
): CustomFieldValues | null {
	if (!patch?.length) return base;
	const next: CustomFieldValues = { ...base };
	const seen = new Set<string>();
	for (const { field, value } of patch) {
		const def = resolveFieldRef(defs, field);
		if (seen.has(def.id)) throw invalid(`Custom field ${describeField(def)} given twice.`);
		seen.add(def.id);
		if (value === null) delete next[def.id];
		else next[def.id] = toStoredValue(def, value);
	}
	return Object.keys(next).length > 0 ? next : null;
}

/** Final domain validation; surfaces the first issue as `Invalid` with its field path. */
function validated(candidate: CommunityProfileInput): CommunityProfileInput {
	const parsed = communityProfileInput.safeParse(candidate);
	if (parsed.success) return parsed.data;
	const issue = parsed.error.issues[0]!;
	const path = issue.path.join(".");
	throw invalid(path ? `${path}: ${issue.message}` : issue.message);
}

/** `create_profile` input → full domain input (unset optional columns are `null`). */
export function createProfileToInput(
	input: Pick<CreateProfileInput, "firstName" | "lastName"> & ProfilePatch,
	defs: CustomFieldDefinition[]
): CommunityProfileInput {
	return validated({
		firstName: input.firstName ?? "",
		lastName: input.lastName ?? "",
		middleName: blankToNull(input.middleName),
		nickName: blankToNull(input.nickName),
		gender: input.gender ?? null,
		email: blankToNull(input.email),
		bloodGroup: input.bloodGroup ?? null,
		mobileNumber: blankToNull(input.mobileNumber),
		dateOfBirth: dayToIso("dateOfBirth", input.dateOfBirth) ?? null,
		dateOfDeath: dayToIso("dateOfDeath", input.dateOfDeath) ?? null,
		customFieldData: applyCustomFields(defs, null, input.customFields),
	});
}

/** Merge a partial patch onto the current row → full domain input for `submit({kind:"info"})`. */
export function patchProfileToInput(
	current: CommunityProfileInput,
	patch: ProfilePatch,
	defs: CustomFieldDefinition[]
): CommunityProfileInput {
	const text = <K extends "middleName" | "nickName" | "mobileNumber" | "email">(k: K) =>
		patch[k] === undefined ? current[k] : blankToNull(patch[k]);
	const day = (k: "dateOfBirth" | "dateOfDeath", was: string | null) => {
		const next = dayToIso(k, patch[k]);
		return next === undefined ? was : next;
	};
	return validated({
		firstName: patch.firstName === undefined ? current.firstName : (patch.firstName ?? ""),
		lastName: patch.lastName === undefined ? current.lastName : (patch.lastName ?? ""),
		middleName: text("middleName"),
		nickName: text("nickName"),
		gender: patch.gender === undefined ? current.gender : patch.gender,
		email: text("email"),
		bloodGroup: patch.bloodGroup === undefined ? current.bloodGroup : patch.bloodGroup,
		mobileNumber: text("mobileNumber"),
		dateOfBirth: day("dateOfBirth", current.dateOfBirth),
		dateOfDeath: day("dateOfDeath", current.dateOfDeath),
		customFieldData: applyCustomFields(defs, current.customFieldData, patch.customFields),
	});
}

// --- relations + addresses -------------------------------------------------------------------

const profileIdField = z.string().min(1).describe("Community Profile id (the subject)");

export const addRelationInput = z.object({
	profileId: profileIdField,
	toId: z.string().min(1).describe("Community Profile id of the other person"),
	type: relationTypeSchema.describe(
		"What toId IS to profileId: 'toId is profileId's <type>'. Never inverted."
	),
	bloodRelation: z.boolean().optional().describe("true if related by blood. Default false."),
	note: optionalText("Free-text note"),
});
export type AddRelationInput = z.infer<typeof addRelationInput>;

export const removeRelationInput = z.object({
	profileId: profileIdField,
	relationId: z
		.string()
		.min(1)
		.describe("Id of one of the profile's OUTGOING relations (get_profile: outgoing[].id)"),
});

const addressIdField = z.string().min(1).describe("Address id (get_profile: addresses[].id)");

export const addAddressInput = z.object({
	profileId: profileIdField,
	line1: z.string().describe("Street / house line"),
	city: z.string().describe("City"),
	state: z.string().describe("State"),
	country: z.string().describe("Country"),
	postalCode: z.string().describe("Postal code"),
	line2: optionalText("Second address line"),
	type: addressTypeSchema.nullable().optional().describe("home, work or other"),
	note: optionalText("Free-text note"),
	digipin: optionalText("DIGIPIN"),
});
export type AddAddressInput = z.infer<typeof addAddressInput>;

export const updateAddressInput = z.object({
	profileId: profileIdField,
	addressId: addressIdField,
	expectedVersion: z
		.number()
		.int()
		.min(0)
		.describe("The address's `version` from get_profile. A mismatch fails with Stale."),
	line1: z.string().optional().describe("Street / house line (cannot be cleared)"),
	city: z.string().optional().describe("City (cannot be cleared)"),
	state: z.string().optional().describe("State (cannot be cleared)"),
	country: z.string().optional().describe("Country (cannot be cleared)"),
	postalCode: z.string().optional().describe("Postal code (cannot be cleared)"),
	line2: optionalText("Second address line"),
	type: addressTypeSchema.nullable().optional().describe("home, work or other"),
	note: optionalText("Free-text note"),
	digipin: optionalText("DIGIPIN"),
});
export type UpdateAddressInput = z.infer<typeof updateAddressInput>;

export const removeAddressInput = z.object({
	profileId: profileIdField,
	addressId: addressIdField,
});

/** Fields an address patch may touch; `undefined` = leave as is, `null` = clear (optional ones). */
export type AddressPatch = Partial<
	Omit<UpdateAddressInput, "profileId" | "addressId" | "expectedVersion">
>;

const normText = (s: string | null | undefined) =>
	(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Idempotency key of an address: normalised line1 + city + postalCode. */
export const addressKey = (a: Pick<AddressInput, "line1" | "city" | "postalCode">) =>
	[a.line1, a.city, a.postalCode].map(normText).join("|");

function validatedAddress(candidate: AddressInput): AddressInput {
	const parsed = addressInput.safeParse(candidate);
	if (parsed.success) return parsed.data;
	const issue = parsed.error.issues[0]!;
	const path = issue.path.join(".");
	throw invalid(path ? `${path}: ${issue.message}` : issue.message);
}

/** `add_address` input → full domain input (unset optional columns are `null`). */
export function addressToInput(
	input: Pick<AddAddressInput, "line1" | "city" | "state" | "country" | "postalCode"> &
		Partial<Pick<AddAddressInput, "line2" | "type" | "note" | "digipin">>
): AddressInput {
	return validatedAddress({
		line1: input.line1,
		line2: blankToNull(input.line2),
		country: input.country,
		state: input.state,
		city: input.city,
		postalCode: input.postalCode,
		type: input.type ?? null,
		note: blankToNull(input.note),
		digipin: blankToNull(input.digipin),
	});
}

/** Merge a partial patch onto the current address → full domain input for `address_edit`. */
export function patchAddressToInput(current: AddressInput, patch: AddressPatch): AddressInput {
	const text = <K extends "line2" | "note" | "digipin">(k: K) =>
		patch[k] === undefined ? current[k] : blankToNull(patch[k]);
	return validatedAddress({
		line1: patch.line1 ?? current.line1,
		line2: text("line2"),
		country: patch.country ?? current.country,
		state: patch.state ?? current.state,
		city: patch.city ?? current.city,
		postalCode: patch.postalCode ?? current.postalCode,
		type: patch.type === undefined ? current.type : patch.type,
		note: text("note"),
		digipin: text("digipin"),
	});
}
