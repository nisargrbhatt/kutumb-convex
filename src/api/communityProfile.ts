import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { getFullUserContextCached } from "./auth";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_PROFILE_BLOOD_GROUP, GENDERS } from "@/db/constants";
import { communityProfile } from "@/db/schema";
import { generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

export const getMyCommunityProfile = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const profileId = cachedUserContext.profile?.id;

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}

		const communityProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),

			columns: {
				organizationId: false,
				profileId: false,
			},
		});

		return communityProfile ?? null;
	});

export const getMyCommunityProfileQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-my-community-profile", props.slug],
		queryFn: async ({ signal }) => {
			const result = await getMyCommunityProfile({
				data: {
					slug: props.slug,
				},
				signal,
			});
			return result;
		},
	});

export const upsertMyCommunityProfile = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			profile: z.object({
				firstName: z.string().min(1, "First name is required"),
				middleName: z.string().optional(),
				lastName: z.string().min(1, "Last name is required"),
				nickName: z.string().optional(),
				gender: z.enum([GENDERS.male, GENDERS.female, GENDERS.other]).optional(),
				email: z.email().optional(),
				bloodGroup: z
					.enum([
						COMMUNITY_PROFILE_BLOOD_GROUP["A+"],
						COMMUNITY_PROFILE_BLOOD_GROUP["A-"],
						COMMUNITY_PROFILE_BLOOD_GROUP["B+"],
						COMMUNITY_PROFILE_BLOOD_GROUP["B-"],
						COMMUNITY_PROFILE_BLOOD_GROUP["AB+"],
						COMMUNITY_PROFILE_BLOOD_GROUP["AB-"],
						COMMUNITY_PROFILE_BLOOD_GROUP["O+"],
						COMMUNITY_PROFILE_BLOOD_GROUP["O-"],
					])
					.optional(),
				mobileNumber: z.string().optional(),
				dateOfBirth: z.string().optional(),
				dateOfDeath: z.string().optional(),
				comment: z.string().optional(),
			}),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const profileId = cachedUserContext.profile?.id;

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}

		const communityProfileItem = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),

			columns: {
				id: true,
			},
		});
		if (!communityProfileItem) {
			await db.insert(communityProfile).values({
				id: generatePrimaryKey("communityProfile"),
				organizationId: organizationId,
				profileId: profileId,
				firstName: data.profile.firstName,
				middleName: data.profile.middleName,
				lastName: data.profile.lastName,
				nickName: data.profile.nickName,
				gender: data.profile.gender,
				email: data.profile.email,
				bloodGroup: data.profile.bloodGroup,
				mobileNumber: data.profile.mobileNumber,
				...(data.profile.dateOfBirth
					? {
							dateOfBirth: data.profile.dateOfBirth,
						}
					: {}),
				...(data.profile.dateOfDeath
					? {
							dateOfDeath: data.profile.dateOfDeath,
						}
					: {}),
				comment: data.profile.comment,
				status: "active",
			});
		} else {
			const communityProfileId = communityProfileItem?.id;
			await db
				.update(communityProfile)
				.set({
					firstName: data.profile.firstName,
					middleName: data.profile.middleName,
					lastName: data.profile.lastName,
					nickName: data.profile.nickName,
					gender: data.profile.gender,
					email: data.profile.email,
					bloodGroup: data.profile.bloodGroup,
					mobileNumber: data.profile.mobileNumber,
					...(data.profile.dateOfBirth
						? {
								dateOfBirth: data.profile.dateOfBirth,
							}
						: {}),
					...(data.profile.dateOfDeath
						? {
								dateOfDeath: data.profile.dateOfDeath,
							}
						: {}),
					comment: data.profile.comment,
					status: "active",
				})
				.where(eq(communityProfile.id, communityProfileId));
		}

		return {
			message: "Community Profile updated successfully",
		};
	});
