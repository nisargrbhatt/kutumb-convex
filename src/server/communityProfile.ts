import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { communityProfile } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { and, count, eq, like, sql } from "drizzle-orm";
import { safeAsync } from "@/lib/safe";
import {
	extractSubgraph,
	getOrgGraphBlob,
	invalidateOrgGraph,
	resolveAnchorId,
	searchProfiles,
} from "@/lib/communityGraphCache";
import { LIMIT_COPY, LimitError } from "@/domain/limits";
import { limits } from "@/lib/limits";
import { AppError } from "@/domain/errors";
import { assertCan } from "@/domain/permission";
import type { CustomFieldDefinition } from "@/domain/customFields";
import { communityProfileInput, fullName, memberFilterSchema } from "@/domain/communityProfile";

export const getMyCommunityProfile = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId, userId } = context.actor;

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, userId)
				),

			columns: {
				organizationId: false,
				userId: false,
			},
		});

		return profile ?? null;
	});

export const getActiveMemberCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId } = context.actor;

		const [result] = await db
			.select({ total: count() })
			.from(communityProfile)
			.where(
				and(
					eq(communityProfile.organizationId, organizationId),
					eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active)
				)
			);

		return result?.total ?? 0;
	});

export const upsertMyCommunityProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(communityProfileInput)
	.handler(async ({ context, data }) => {
		const { organizationId, userId } = context.actor;

		const communityProfileItem = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, userId)
				),

			columns: {
				id: true,
			},
		});
		if (!communityProfileItem) {
			try {
				await limits.assertProfileSlot(organizationId, userId);
			} catch (e) {
				if (e instanceof LimitError) {
					throw new AppError("LimitReached", LIMIT_COPY.profileSelf.description, e.code);
				}
				throw e;
			}

			await db.insert(communityProfile).values({
				...data,
				id: generatePrimaryKey(),
				organizationId,
				userId,
				status: COMMUNITY_PROFILE_STATUS.active,
			});
		} else {
			const communityProfileId = communityProfileItem?.id;
			await db
				.update(communityProfile)
				.set({ ...data, status: COMMUNITY_PROFILE_STATUS.active })
				.where(eq(communityProfile.id, communityProfileId));
		}

		await invalidateOrgGraph(organizationId);

		return {
			message: "Community Profile updated successfully",
		};
	});

export const getCommunityProfileList = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId } = context.actor;

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

export const getActiveProfilesForRelation = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			subjectId: z.string().min(1, "Subject profile is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const { organizationId } = context.actor;

		const communityProfiles = await db.query.communityProfile.findMany({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.status, COMMUNITY_PROFILE_STATUS.active),
					operators.ne(fields.id, data.subjectId)
				),
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

export const getCommunityMembers = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(memberFilterSchema)
	.handler(async ({ context, data }) => {
		const { organizationId } = context.actor;

		const conditions = [eq(communityProfile.organizationId, organizationId)];

		if (data.search.trim().length > 0) {
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

export const getFocusedCommunityGraph = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			focusId: z.string().optional(),
			depth: z.number().int().min(1).max(3).default(2),
		})
	)
	.handler(async ({ context, data }) => {
		const { organizationId, userId } = context.actor;

		const blob = await getOrgGraphBlob(organizationId);

		// Resolve anchor: requested focus → own profile (if active & connected) → most-connected node.
		let preferredId = data.focusId;
		if (!preferredId) {
			const ownProfile = await db.query.communityProfile.findFirst({
				where: (fields, ops) =>
					ops.and(ops.eq(fields.organizationId, organizationId), ops.eq(fields.userId, userId)),
				columns: { id: true },
			});
			if (ownProfile && blob.profiles.some((p) => p.id === ownProfile.id)) {
				preferredId = ownProfile.id;
			}
		}

		const anchorId = resolveAnchorId(blob, preferredId);
		return extractSubgraph(blob, anchorId, data.depth);
	});

export const searchCommunityProfilesLite = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(z.object({ query: z.string() }))
	.handler(async ({ context, data }) => {
		const { organizationId } = context.actor;

		const blob = await getOrgGraphBlob(organizationId);
		return searchProfiles(blob, data.query, 20);
	});

export const getCommunityMemberById = createServerFn({ method: "GET" })
	.validator(
		z.object({
			id: z.string().describe("Community Profile Id"),
		})
	)
	.middleware([orgMiddleware])
	.handler(async ({ context, data }) => {
		const { organizationId } = context.actor;

		const foundProfile = await db.query.communityProfile.findFirst({
			where: (fields, ops) =>
				ops.and(ops.eq(fields.id, data.id), ops.eq(fields.organizationId, organizationId)),
			columns: {
				organizationId: false,
			},
		});

		if (!foundProfile) {
			throw new AppError("NotFound", "Community Profile not found");
		}

		const profileAddresses = await db.query.communityAddress.findMany({
			where: (fields, ops) => ops.eq(fields.communityProfileId, foundProfile.id),
			columns: {
				communityProfileId: false,
			},
		});

		const customFieldDefs = await db.query.communityProfileCustomField.findMany({
			where: (fields, ops) => ops.eq(fields.organizationId, organizationId),
			columns: { id: true, label: true, type: true },
		});

		const counterpartColumns = {
			id: true,
			firstName: true,
			middleName: true,
			lastName: true,
			nickName: true,
		} as const;

		// Outgoing: subject is the `from`. Type read subject-centric.
		const outgoingRelations = await db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.fromId, foundProfile.id),
			columns: { organizationId: false },
			with: {
				toCommunityProfile: { columns: counterpartColumns },
			},
		});

		// Incoming: subject is the `to`. Type shown as stored (no inversion — ADR 0001).
		const incomingRelations = await db.query.communityRelation.findMany({
			where: (fields, ops) => ops.eq(fields.toId, foundProfile.id),
			columns: { organizationId: false },
			with: {
				fromCommunityProfile: { columns: counterpartColumns },
			},
		});

		return {
			profile: foundProfile,
			addresses: profileAddresses,
			customFieldDefs: customFieldDefs satisfies CustomFieldDefinition[],
			outgoingRelations,
			incomingRelations,
		};
	});

export const acceptCommunityProfile = createServerFn({ method: "POST" })
	.validator(
		z.object({
			memberId: z.string().describe("Community Profile Id"),
		})
	)
	.middleware([orgMiddleware])
	.handler(async ({ data, context }) => {
		assertCan(context.actor, { communityProfile: ["approve"] });

		const { organizationId } = context.actor;

		const existingProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.memberId),
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.status, COMMUNITY_PROFILE_STATUS.draft)
				),
			columns: {
				id: true,
			},
		});

		if (!existingProfile) {
			throw new AppError("NotFound", "Community Profile not found which is in draft state");
		}

		await db
			.update(communityProfile)
			.set({
				status: COMMUNITY_PROFILE_STATUS.active,
			})
			.where(eq(communityProfile.id, data.memberId));

		await invalidateOrgGraph(organizationId);

		return {
			message: "Community Profile accepted successfully",
		};
	});

export const rejectCommunityProfile = createServerFn({ method: "POST" })
	.validator(
		z.object({
			memberId: z.string().describe("Community Profile Id"),
		})
	)
	.middleware([orgMiddleware])
	.handler(async ({ data, context }) => {
		assertCan(context.actor, { communityProfile: ["reject"] });

		const { organizationId } = context.actor;

		const existingProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.memberId),
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.status, COMMUNITY_PROFILE_STATUS.draft)
				),
			columns: {
				id: true,
			},
		});

		if (!existingProfile) {
			throw new AppError("NotFound", "Community Profile not found which is in draft state");
		}

		await db
			.update(communityProfile)
			.set({
				status: COMMUNITY_PROFILE_STATUS.inactive,
			})
			.where(eq(communityProfile.id, data.memberId));

		await invalidateOrgGraph(organizationId);

		return {
			message: "Community Profile rejected successfully",
		};
	});

export const reassignProfileToUser = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			memberId: z.string(),
			userId: z.string(),
		})
	)
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { communityProfile: ["reassign"] });

		const { organizationId, userId: actorUserId } = context.actor;

		if (data.userId === actorUserId) {
			throw new Error("Can't assign profile to yourself");
		}

		const user = await db.query.user.findFirst({
			where: (fields, operators) => operators.eq(fields.id, data.userId),
			columns: {
				id: true,
			},
		});

		if (!user) {
			throw new AppError("NotFound", "User doesn't exist");
		}

		const memberProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.memberId),
					operators.eq(fields.organizationId, organizationId),
					operators.isNull(fields.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!memberProfile) {
			throw new AppError("NotFound", "Member profile doesn't exist or already has linked user");
		}

		await db
			.update(communityProfile)
			.set({
				userId: user.id,
			})
			.where(eq(communityProfile.id, memberProfile.id));

		await invalidateOrgGraph(organizationId);

		return {
			message: "Profile reassigned successfully",
		};
	});

export const addMissingMember = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(communityProfileInput)
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { communityProfile: ["create"] });

		const { organizationId, userId } = context.actor;

		try {
			await limits.assertProfileSlot(organizationId, userId);
		} catch (e) {
			if (e instanceof LimitError) {
				throw new AppError("LimitReached", LIMIT_COPY.profileAdmin.description, e.code);
			}
			throw e;
		}

		const actorProfile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.userId, userId),
					operators.eq(fields.organizationId, organizationId)
				),
			columns: { firstName: true, middleName: true, lastName: true },
		});

		const result = await safeAsync(
			db.insert(communityProfile).values({
				...data,
				id: generatePrimaryKey(),
				comment: `Added by ${actorProfile ? fullName(actorProfile) : context.session.user.email}`,
				organizationId,
				status: COMMUNITY_PROFILE_STATUS.draft,
			})
		);

		if (!result.success) {
			console.error(result.error);
			throw new Error("Failed to add member");
		}

		await invalidateOrgGraph(organizationId);

		return {
			message: "Member added successfully",
		};
	});
