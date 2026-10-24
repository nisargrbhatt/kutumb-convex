import { z } from "zod";
import { genderSchema, fullName, profileStatusSchema } from "@/domain/communityProfile";
import { storedIsoToDay } from "@/domain/calendarDay";
import type { Actor } from "@/domain/permission";
import { customFieldTypeSchema, storedCustomFieldValueSchema } from "@/domain/customFields";
import { relationTypeSchema } from "@/domain/relation";
import { getCommunityProfileDetail } from "@/domain/queries/profiles";
import type { QueryDb } from "@/domain/queries/db";
import { COMMUNITY_ADDRESS_TYPE, COMMUNITY_PROFILE_BLOOD_GROUP } from "@/db/constants";

const counterpart = z.object({
	id: z.string(),
	fullName: z.string(),
	gender: genderSchema.nullable(),
	status: profileStatusSchema,
});

const relation = z.object({ type: relationTypeSchema.nullable(), counterpart });

export const getProfileOutput = z.object({
	id: z.string(),
	fullName: z.string(),
	firstName: z.string(),
	middleName: z.string().nullable(),
	lastName: z.string(),
	nickName: z.string().nullable(),
	gender: genderSchema.nullable(),
	email: z.string().nullable(),
	status: profileStatusSchema,
	bloodGroup: z.enum(COMMUNITY_PROFILE_BLOOD_GROUP).nullable(),
	mobileNumber: z.string().nullable(),
	dateOfBirth: z.string().nullable().describe("YYYY-MM-DD"),
	dateOfDeath: z.string().nullable().describe("YYYY-MM-DD"),
	comment: z.string().nullable(),
	userId: z.string().nullable().describe("Linked app user; null for a userless profile."),
	addresses: z.array(
		z.object({
			id: z.string(),
			line1: z.string(),
			line2: z.string().nullable(),
			city: z.string(),
			state: z.string(),
			country: z.string(),
			postalCode: z.string(),
			type: z.enum(COMMUNITY_ADDRESS_TYPE).nullable(),
			note: z.string().nullable(),
			digipin: z.string().nullable(),
		})
	),
	customFields: z
		.array(
			z.object({
				id: z.string(),
				label: z.string(),
				type: customFieldTypeSchema,
				value: storedCustomFieldValueSchema,
			})
		)
		.describe(
			"Every custom field of the community in definition order; `value` is null when unset. date fields are YYYY-MM-DD."
		),
	outgoing: z.array(relation).describe("Counterpart is the subject's `<type>`."),
	incoming: z.array(relation).describe("Subject is the counterpart's `<type>`."),
});

export const getProfileDescription = `Returns one Community Profile with every field you can see in the app: contact details, addresses, labelled custom fields and relations.

Relations are subject-centric and are NEVER inverted. Read the section, then the type:
- outgoing[{type, counterpart}] = the counterpart is the subject's <type>.
- incoming[{type, counterpart}] = the subject is the counterpart's <type>.

Worked example, subject Jared: outgoing [{type:"sister", counterpart: Anna}] means Anna is Jared's sister. incoming [{type:"brother", counterpart: Mia}] means Jared is Mia's brother (so Mia is Jared's sibling; counterpart.gender tells sister vs brother). It does NOT mean Mia is Jared's brother. To find "Jared's sisters", take outgoing entries of type "sister" plus incoming "brother"/"sister" entries whose counterpart.gender is "female".

customFields lists every custom field of the community in order as {id, label, type, value}; value is null when the profile has none. Dates (dateOfBirth, dateOfDeath, date fields) are YYYY-MM-DD.

Only "active" profiles (and your own linked profile, whatever its status) can be fetched; any other id returns "not found". Relations list "active" counterparts only. Use search_profiles to find an id.`;

type View = z.input<typeof getProfileOutput>;
type Detail = Awaited<ReturnType<typeof getCommunityProfileDetail>>;

export function toProfileView(detail: Detail): View {
	const { profile, addresses, customFieldDefs, outgoingRelations, incomingRelations } = detail;
	// `version` is an internal concurrency counter, not a profile field.
	const { customFieldData, version: _version, ...columns } = profile;

	const toCounterpart = (
		p: NonNullable<Detail["outgoingRelations"][number]["toCommunityProfile"]>
	) => ({
		id: p.id,
		fullName: fullName(p),
		gender: p.gender,
		status: p.status,
	});

	return {
		...columns,
		dateOfBirth: storedIsoToDay(columns.dateOfBirth),
		dateOfDeath: storedIsoToDay(columns.dateOfDeath),
		fullName: fullName(profile),
		addresses: addresses.map(({ version: _version, ...address }) => address),
		// Every definition, in order; values of deleted definitions (orphans) never show.
		customFields: customFieldDefs.map((def) => {
			const value = customFieldData?.[def.id] ?? null;
			return {
				...def,
				value: def.type === "date" && typeof value === "string" ? storedIsoToDay(value) : value,
			};
		}),
		outgoing: outgoingRelations.flatMap((r) =>
			r.toCommunityProfile
				? [{ type: r.type, counterpart: toCounterpart(r.toCommunityProfile) }]
				: []
		),
		incoming: incomingRelations.flatMap((r) =>
			r.fromCommunityProfile
				? [{ type: r.type, counterpart: toCounterpart(r.fromCommunityProfile) }]
				: []
		),
	};
}

export async function getProfile(db: QueryDb, actor: Actor, input: { id: string }): Promise<View> {
	return toProfileView(
		await getCommunityProfileDetail(db, actor, input.id, { audience: "aiClient" })
	);
}
