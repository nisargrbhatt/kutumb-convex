import { z } from "zod";

export const countProfilesOutput = z.object({
	total: z.number().int().describe("Profiles matching the filters (each counted once)."),
	asOf: z
		.string()
		.describe("Today, YYYY-MM-DD. Use it to turn ages into bornOnOrAfter/bornOnOrBefore days."),
	groups: z
		.array(
			z.object({
				value: z
					.union([z.string(), z.boolean(), z.null()])
					.describe(
						"The group: a text, a boolean (living, boolean fields), or null for profiles with no value."
					),
				count: z.number().int(),
			})
		)
		.optional()
		.describe("Present only with groupBy. Largest first; the null group, when non-empty, is last."),
	otherGroups: z
		.number()
		.int()
		.describe("How many smaller groups were folded away (max 50 shown)."),
	otherCount: z.number().int().describe("Profiles in the folded groups."),
	overlapping: z
		.literal(true)
		.optional()
		.describe(
			"Present when a profile is in several groups, so groups can add up to more than total."
		),
});

export const countProfilesDescription = `Counts Community Profiles, optionally split into groups, so you can answer "how many" and "breakdown by" questions without paging every profile. Only \`active\` profiles are counted.

Accepts the same filters as search_profiles, ANDed: query, gender, bloodGroup, bornOnOrAfter / bornOnOrBefore (YYYY-MM-DD), city / state / country, living, customFieldFilters. Pass groupBy to split the count by one dimension (no cross-tabs):
- {core: "gender" | "bloodGroup" | "living" | "city" | "state" | "country" | "birthDecade"} (birthDecade groups look like "1990s").
- {field: "<custom field id or label>"} for text and boolean custom fields. Number and date fields cannot be grouped: use customFieldFilters ranges instead, one count per range.

Groups are ordered by count, at most 50 (the rest are folded into otherGroups / otherCount). Profiles with no value for the dimension go in a group with value null. Places match case-insensitively on trimmed text and are labelled with the most common spelling; a profile counts once per distinct place it has an address in, so place groups can add up to more than total (overlapping: true). Deceased people are included unless you filter: pass living: true for "alive", "today" or "current" questions. To count by age, use asOf (today) to convert the age into a birth-day range.`;
