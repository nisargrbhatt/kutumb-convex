import { z } from "zod";
import { genderSchema, fullName, profileStatusSchema } from "@/domain/communityProfile";
import type { Actor } from "@/domain/permission";
import { customFieldTypeSchema, customFieldValueSchema } from "@/domain/customFields";
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
	dateOfBirth: z.string().nullable().describe("ISO 8601"),
	dateOfDeath: z.string().nullable().describe("ISO 8601"),
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
				value: customFieldValueSchema,
			})
		)
		.describe("Only fields that have a value on this profile."),
	outgoing: z.array(relation).describe("Counterpart is the subject's `<type>`."),
	incoming: z.array(relation).describe("Subject is the counterpart's `<type>`."),
});

export const getProfileDescription = `Returns one Community Profile with every field you can see in the app: contact details, addresses, labelled custom fields and relations.

Relations are subject-centric and are NEVER inverted. Read the section, then the type:
- outgoing[{type, counterpart}] = the counterpart is the subject's <type>.
- incoming[{type, counterpart}] = the subject is the counterpart's <type>.

Worked example, subject Jared: outgoing [{type:"sister", counterpart: Anna}] means Anna is Jared's sister. incoming [{type:"brother", counterpart: Mia}] means Jared is Mia's brother (so Mia is Jared's sibling; counterpart.gender tells sister vs brother). It does NOT mean Mia is Jared's brother. To find "Jared's sisters", take outgoing entries of type "sister" plus incoming "brother"/"sister" entries whose counterpart.gender is "female".

Works for profiles of any status. Use search_profiles to find an id.`;

type View = z.input<typeof getProfileOutput>;
type Detail = Awaited<ReturnType<typeof getCommunityProfileDetail>>;

export function toProfileView(detail: Detail): View {
	const { profile, addresses, customFieldDefs, outgoingRelations, incomingRelations } = detail;
	const { customFieldData, ...columns } = profile;

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
		fullName: fullName(profile),
		addresses,
		customFields: customFieldDefs.flatMap((def) => {
			const value = customFieldData?.[def.id];
			return value === undefined || value === null ? [] : [{ ...def, value }];
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
	return toProfileView(await getCommunityProfileDetail(db, actor, input.id));
}
