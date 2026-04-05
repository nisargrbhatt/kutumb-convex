import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_PROFILE_BLOOD_GROUP, COMMUNITY_PROFILE_STATUS, GENDERS } from "@/db/constants";
import { communityProfile } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { and, count, eq, like, sql } from "drizzle-orm";

export const getMyCommunityProfile = createServerFn({ method: "GET" })
	.middleware([authMiddleware])

	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const communityProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),

			columns: {
				organizationId: false,
				userId: false,
			},
		});

		return communityProfile ?? null;
	});

export const getMyCommunityProfileQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-profile"],
		queryFn: async () => {
			const result = await getMyCommunityProfile();
			return result;
		},
		staleTime: 0,
		gcTime: 0,
	});

export const upsertMyCommunityProfile = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
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
		})
	)
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const communityProfileItem = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),

			columns: {
				id: true,
			},
		});
		if (!communityProfileItem) {
			await db.insert(communityProfile).values({
				id: generatePrimaryKey(),
				organizationId: organizationId,
				userId: context.userId,
				firstName: data.firstName,
				middleName: data.middleName,
				lastName: data.lastName,
				nickName: data.nickName,
				gender: data.gender,
				email: data.email,
				bloodGroup: data.bloodGroup,
				mobileNumber: data.mobileNumber,
				...(data.dateOfBirth
					? {
							dateOfBirth: data.dateOfBirth,
						}
					: {}),
				...(data.dateOfDeath
					? {
							dateOfDeath: data.dateOfDeath,
						}
					: {}),
				comment: data.comment,
				status: "active",
				...(data?.customFieldData
					? {
							customFieldData: data?.customFieldData,
						}
					: {}),
			});
		} else {
			const communityProfileId = communityProfileItem?.id;
			await db
				.update(communityProfile)
				.set({
					firstName: data.firstName,
					middleName: data.middleName,
					lastName: data.lastName,
					nickName: data.nickName,
					gender: data.gender,
					email: data.email,
					bloodGroup: data.bloodGroup,
					mobileNumber: data.mobileNumber,
					...(data.dateOfBirth
						? {
								dateOfBirth: data.dateOfBirth,
							}
						: {}),
					...(data.dateOfDeath
						? {
								dateOfDeath: data.dateOfDeath,
							}
						: {}),
					comment: data.comment,
					status: "active",
					...(data?.customFieldData
						? {
								customFieldData: data?.customFieldData,
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
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
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

export const getCommunityProfileListQuery = () =>
	queryOptions({
		queryKey: ["get-community-profile-list"],
		queryFn: async () => {
			const result = await getCommunityProfileList();
			return result;
		},
	});

export const getCommunityMembers = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
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
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
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
	search?: string;
	status?: string;
	gender?: string;
	page?: number;
	pageSize?: number;
}) =>
	queryOptions({
		queryKey: [
			"get-community-members",

			props.search ?? "",
			props.status ?? "",
			props.gender ?? "",
			props.page ?? 1,
			props.pageSize ?? 10,
		],
		queryFn: async () => {
			const result = await getCommunityMembers({
				data: {
					search: props.search,
					status: props.status as "active" | "inactive" | "draft" | undefined,
					gender: props.gender as "male" | "female" | "other" | undefined,
					page: props.page ?? 1,
					pageSize: props.pageSize ?? 10,
				},
			});
			return result;
		},
	});

export const getCommunityTree = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
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

export const getCommunityTreeQuery = () =>
	queryOptions({
		queryKey: ["get-community-tree"],
		queryFn: async () => {
			const result = await getCommunityTree();
			return result;
		},
	});

export const getCommunityMemberById = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			id: z.string().describe("Community Profile Id"),
		})
	)
	.middleware([authMiddleware])
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const communityProfile = await db.query.communityProfile.findFirst({
			where: (fields, ops) =>
				ops.and(ops.eq(fields.id, data.id), ops.eq(fields.organizationId, organizationId)),
			columns: {
				organizationId: false,
			},
		});

		if (!communityProfile) {
			throw new Error("Community Profile not found");
		}

		const profileAddresses = await db.query.communityAddress.findMany({
			where: (fields, ops) => ops.eq(fields.communityProfileId, communityProfile.id),
			columns: {
				communityProfileId: false,
			},
		});

		const customFields = await db.query.communityProfileCustomField.findMany({
			where: (fields, ops) => ops.eq(fields.organizationId, organizationId),
			columns: {
				label: true,
			},
		});

		// const profileRelations = await db.query.communityRelation.findMany({
		// 	where: (fields, ops) =>
		// 		ops.or(
		// 			ops.eq(fields.fromId, communityProfile.id),
		// 			ops.eq(fields.toId, communityProfile.id)
		// 		),
		// 	columns: {
		// 		organizationId: false,
		// 	},
		// });

		return {
			profile: communityProfile,
			addresses: profileAddresses,
			customFields: customFields?.map((i) => i.label),
		};
	});
