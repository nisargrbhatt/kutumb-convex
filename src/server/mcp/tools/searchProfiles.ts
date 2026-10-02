import { z } from "zod";
import { genderSchema, profileStatusSchema } from "@/domain/communityProfile";

export const searchProfilesOutput = z.object({
	items: z.array(
		z.object({
			id: z.string().describe("Community Profile id; pass to get_profile."),
			fullName: z.string(),
			nickName: z.string().nullable(),
			gender: genderSchema.nullable(),
			status: profileStatusSchema,
		})
	),
	nextCursor: z
		.string()
		.nullable()
		.describe("Pass as `cursor` for the next page; null at the end."),
});

export const searchProfilesDescription =
	"Searches Community Profiles (people in the community, not app users) by name. Returns a compact list; call get_profile with an id for full details and relations. Only `active` profiles are returned unless `status` says otherwise. Results are paged: while `nextCursor` is non-null, call again with it as `cursor`.";
