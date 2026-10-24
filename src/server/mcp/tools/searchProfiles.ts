import { z } from "zod";
import { COMMUNITY_PROFILE_BLOOD_GROUP } from "@/db/constants";
import { genderSchema, profileStatusSchema } from "@/domain/communityProfile";
import { customFieldTypeSchema, storedCustomFieldValueSchema } from "@/domain/customFields";

export const searchProfilesOutput = z.object({
	items: z.array(
		z.object({
			id: z.string().describe("Community Profile id; pass to get_profile."),
			fullName: z.string(),
			nickName: z.string().nullable(),
			gender: genderSchema.nullable(),
			status: profileStatusSchema,
			bloodGroup: z
				.enum(COMMUNITY_PROFILE_BLOOD_GROUP)
				.nullable()
				.optional()
				.describe("Present only when filtering by bloodGroup."),
			dateOfBirth: z
				.string()
				.nullable()
				.optional()
				.describe("YYYY-MM-DD. Present only when filtering by bornOnOrAfter/bornOnOrBefore."),
			dateOfDeath: z
				.string()
				.nullable()
				.optional()
				.describe("YYYY-MM-DD, null when living. Present only when filtering by living."),
			addresses: z
				.array(
					z.object({
						city: z.string().optional(),
						state: z.string().optional(),
						country: z.string().optional(),
					})
				)
				.optional()
				.describe(
					"Addresses that matched the city/state/country filter, with only the filtered parts."
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
				.optional()
				.describe("Values of the custom fields used in customFieldFilters; dates are YYYY-MM-DD."),
		})
	),
	nextCursor: z
		.string()
		.nullable()
		.describe("Pass as `cursor` for the next page; null at the end."),
});

export const searchProfilesDescription = `Searches and filters Community Profiles (people in the community, not app users). Returns a compact list; call get_profile with an id for full details and relations. Only \`active\` profiles are returned.

All filters are optional and ANDed: query (name words), gender, bloodGroup (any of the listed), bornOnOrAfter / bornOnOrBefore (YYYY-MM-DD, inclusive), city / state / country (case-insensitive exact match; a profile matches if any of its addresses does, and when several are given one address must match all), living, and customFieldFilters (max 5; field by id or label, see list_custom_fields). customFieldFilters ops: text eq / contains, number eq / gt / gte / lt / lte, date eq / before / after, boolean eq, any type isSet / isNotSet.

Deceased people are included unless you filter. Pass living: true for "alive", "today" or "current" questions, living: false for deceased. To filter by age, convert it to a birth-day range.

Each item echoes only the fields you filtered on (besides id, name, gender, status), so you can read the match without calling get_profile. Results are paged: while \`nextCursor\` is non-null, call again with it as \`cursor\`.`;
