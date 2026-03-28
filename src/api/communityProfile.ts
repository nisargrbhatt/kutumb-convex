import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { getFullUserContextCached } from "./auth";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_PROFILE_BLOOD_GROUP, COMMUNITY_PROFILE_STATUS, GENDERS } from "@/db/constants";
import { communityProfile } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { and, count, eq, like, sql } from "drizzle-orm";

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
				customFieldData: z.record(z.string(), z.any()).optional(),
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
				...(data?.profile?.customFieldData
					? {
							customFieldData: data?.profile?.customFieldData,
						}
					: {}),
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
					...(data?.profile?.customFieldData
						? {
								customFieldData: data?.profile?.customFieldData,
							}
						: {}),
				})
				.where(eq(communityProfile.id, communityProfileId));
		}

		return {
			message: "Community Profile updated successfully",
		};
	});

export const getCommunityProfileList = createServerFn({ method: "GET" })
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

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}

		const communityProfiles = await db.query.communityProfile.findMany({
			where: (fields, operators) => operators.eq(fields.organizationId, organizationId),
			columns: {
				id: true,
				firstName: true,
				lastName: true,
				middleName: true,
				nickName: true,
			},
		});

		return communityProfiles;
	});

export const getCommunityProfileListQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-community-profile-list", props.slug],
		queryFn: async ({ signal }) => {
			const result = await getCommunityProfileList({
				data: {
					slug: props.slug,
				},
				signal,
			});
			return result;
		},
	});

export const getCommunityMembers = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			search: z.string().optional(),
			status: z
				.enum([
					COMMUNITY_PROFILE_STATUS.active,
					COMMUNITY_PROFILE_STATUS.inactive,
					COMMUNITY_PROFILE_STATUS.draft,
				])
				.optional(),
			gender: z.enum([GENDERS.male, GENDERS.female, GENDERS.other]).optional(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(1).max(100).default(10),
		})
	)
	.handler(async ({ context, data }) => {
		const cachedUserContext = await getFullUserContextCached(context.userId);

		if (!cachedUserContext) {
			throw new Error("User not found");
		}

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}

		const conditions = [eq(communityProfile.organizationId, organizationId)];

		if (data.search && data.search.trim().length > 0) {
			const searchTerm = `%${data.search.trim()}%`;
			conditions.push(
				sql`(${like(communityProfile.firstName, searchTerm)} OR ${like(communityProfile.lastName, searchTerm)} OR ${like(communityProfile.email, searchTerm)})`
			);
		}

		if (data.status) {
			conditions.push(eq(communityProfile.status, data.status));
		}

		if (data.gender) {
			conditions.push(eq(communityProfile.gender, data.gender));
		}

		const whereClause = and(...conditions);
		const offset = (data.page - 1) * data.pageSize;

		const [members, totalResult] = await Promise.all([
			db.query.communityProfile.findMany({
				where: () => whereClause!,
				limit: data.pageSize,
				offset,
				columns: {
					id: true,
					firstName: true,
					middleName: true,
					lastName: true,
					nickName: true,
					gender: true,
					email: true,
					status: true,
					bloodGroup: true,
					mobileNumber: true,
					dateOfBirth: true,
				},
			}),
			db.select({ total: count() }).from(communityProfile).where(whereClause!),
		]);

		return {
			data: members,
			total: totalResult[0]?.total ?? 0,
			page: data.page,
			pageSize: data.pageSize,
		};
	});

export const getCommunityMembersQuery = (props: {
	slug: string;
	search?: string;
	status?: string;
	gender?: string;
	page?: number;
	pageSize?: number;
}) =>
	queryOptions({
		queryKey: [
			"get-community-members",
			props.slug,
			props.search ?? "",
			props.status ?? "",
			props.gender ?? "",
			props.page ?? 1,
			props.pageSize ?? 10,
		],
		queryFn: async ({ signal }) => {
			const result = await getCommunityMembers({
				data: {
					slug: props.slug,
					search: props.search,
					status: props.status as "active" | "inactive" | "draft" | undefined,
					gender: props.gender as "male" | "female" | "other" | undefined,
					page: props.page ?? 1,
					pageSize: props.pageSize ?? 10,
				},
				signal,
			});
			return result;
		},
	});

export const getCommunityTree = createServerFn({ method: "GET" })
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

		const organizationId = cachedUserContext?.organization?.find((o) => o.slug === data.slug)?.id;

		if (!organizationId) {
			throw new Error("Organization not found");
		}

		const [profiles, relations] = await Promise.all([
			db.query.communityProfile.findMany({
				where: (fields, operators) => operators.eq(fields.organizationId, organizationId),
				columns: {
					id: true,
					firstName: true,
					middleName: true,
					lastName: true,
					nickName: true,
					email: true,
					gender: true,
					status: true,
				},
			}),
			db.query.communityRelation.findMany({
				where: (fields, operators) => operators.eq(fields.organizationId, organizationId),
				columns: {
					id: true,
					fromId: true,
					toId: true,
					type: true,
					note: true,
					bloodRelation: true,
				},
			}),
		]);

		return {
			profiles,
			relations,
		};
	});

export const getCommunityTreeQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-community-tree", props.slug],
		queryFn: async ({ signal }) => {
			const result = await getCommunityTree({
				data: {
					slug: props.slug,
				},
				signal,
			});
			return result;
		},
	});
