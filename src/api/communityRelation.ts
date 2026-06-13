import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_PROFILE_STATUS, COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { communityRelation } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { count, eq } from "drizzle-orm";
import { invalidateOrgGraph } from "@/lib/communityGraphCache";
import { auth } from "@/lib/auth";
import { getRequestHeaders } from "@tanstack/react-start/server";

const relationTypeSchema = z.enum([
	COMMUNITY_RELATION_TYPE.brother,
	COMMUNITY_RELATION_TYPE.brother_in_law,
	COMMUNITY_RELATION_TYPE.child,
	COMMUNITY_RELATION_TYPE.father,
	COMMUNITY_RELATION_TYPE.father_in_law,
	COMMUNITY_RELATION_TYPE.mother,
	COMMUNITY_RELATION_TYPE.mother_in_law,
	COMMUNITY_RELATION_TYPE.sister,
	COMMUNITY_RELATION_TYPE.sister_in_law,
	COMMUNITY_RELATION_TYPE.wife,
	COMMUNITY_RELATION_TYPE.husband,
	COMMUNITY_RELATION_TYPE.uncle,
	COMMUNITY_RELATION_TYPE.aunt,
]);

export const getMyCommunityRelationships = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			return [];
		}

		const relationships = await db.query.communityRelation.findMany({
			where: (fields, operators) => operators.eq(fields.fromId, profile.id),
			with: {
				toCommunityProfile: {
					columns: {
						id: true,
						firstName: true,
						lastName: true,
						middleName: true,
						nickName: true,
					},
				},
			},
		});

		return relationships;
	});

export const getMyCommunityRelationshipsQuery = () =>
	queryOptions({
		queryKey: ["get-my-community-relationships"],
		queryFn: async () => {
			const result = await getMyCommunityRelationships();
			return result;
		},
	});

export const getMyIncomingRelationCount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			return 0;
		}

		const [result] = await db
			.select({ total: count() })
			.from(communityRelation)
			.where(eq(communityRelation.toId, profile.id));

		return result?.total ?? 0;
	});

export const getMyIncomingRelationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-incoming-relation-count"],
		queryFn: async () => {
			const result = await getMyIncomingRelationCount();
			return result;
		},
	});

export const getMyOutgoingRelationCount = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			return 0;
		}

		const [result] = await db
			.select({ total: count() })
			.from(communityRelation)
			.where(eq(communityRelation.fromId, profile.id));

		return result?.total ?? 0;
	});

export const getMyOutgoingRelationCountQuery = () =>
	queryOptions({
		queryKey: ["get-my-outgoing-relation-count"],
		queryFn: async () => {
			const result = await getMyOutgoingRelationCount();
			return result;
		},
	});

export const addMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			type: z.enum([
				COMMUNITY_RELATION_TYPE.brother,
				COMMUNITY_RELATION_TYPE.brother_in_law,
				COMMUNITY_RELATION_TYPE.child,
				COMMUNITY_RELATION_TYPE.father,
				COMMUNITY_RELATION_TYPE.father_in_law,
				COMMUNITY_RELATION_TYPE.mother,
				COMMUNITY_RELATION_TYPE.mother_in_law,
				COMMUNITY_RELATION_TYPE.sister,
				COMMUNITY_RELATION_TYPE.sister_in_law,
				COMMUNITY_RELATION_TYPE.wife,
				COMMUNITY_RELATION_TYPE.husband,
				COMMUNITY_RELATION_TYPE.uncle,
				COMMUNITY_RELATION_TYPE.aunt,
			]),
			toId: z.string().min(1, "Target profile is required"),
			note: z.string().optional(),
			bloodRelation: z.boolean().default(false).optional(),
		})
	)
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		if (profile.id === data.toId) {
			throw new Error("You cannot add a relationship to yourself");
		}

		const existingRelationship = await db.query.communityRelation.findFirst({
			where: (fields, operators) =>
				operators.or(
					operators.and(
						operators.eq(fields.fromId, profile.id),
						operators.eq(fields.toId, data.toId)
					),
					operators.and(
						operators.eq(fields.toId, profile.id),
						operators.eq(fields.fromId, data.toId)
					)
				),
			columns: {
				id: true,
			},
		});

		if (existingRelationship) {
			throw new Error("Relationship already exists");
		}

		await db.insert(communityRelation).values({
			id: generatePrimaryKey(),
			fromId: profile.id,
			toId: data.toId,
			organizationId: organizationId,
			type: data.type,
			note: data.note,
			bloodRelation: data.bloodRelation,
		});

		await invalidateOrgGraph(organizationId);

		return {
			message: "Relationship added successfully",
		};
	});

export const deleteMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			id: z.string().trim().min(1, "Relationship ID is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.userId, context.userId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		const relationship = await db.query.communityRelation.findFirst({
			where: (fields, operators) =>
				operators.and(operators.eq(fields.id, data.id), operators.eq(fields.fromId, profile.id)),
			columns: {
				id: true,
			},
		});

		if (!relationship) {
			throw new Error("Relationship not found or does not belong to you");
		}

		await db.delete(communityRelation).where(eq(communityRelation.id, relationship.id));

		await invalidateOrgGraph(organizationId);

		return {
			message: "Relationship deleted successfully",
		};
	});

// Owner/admin add an outgoing relation on behalf of a userless, active profile.
export const addCommunityRelationToProfile = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			subjectId: z.string().trim().min(1, "Subject profile is required"),
			type: relationTypeSchema,
			toId: z.string().trim().min(1, "Target profile is required"),
			note: z.string().optional(),
			bloodRelation: z.boolean().default(false).optional(),
		})
	)
	.handler(async ({ context, data }) => {
		const canManageRelations = await auth.api.hasPermission({
			headers: getRequestHeaders(),
			body: {
				permissions: {
					communityProfile: ["manageRelations"],
				},
			},
		});

		if (!canManageRelations.success) {
			throw new Error("You do not have permission to manage relations");
		}

		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		if (data.subjectId === data.toId) {
			throw new Error("A profile cannot have a relation to itself");
		}

		const subject = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.subjectId),
					operators.eq(fields.organizationId, organizationId)
				),
			columns: {
				id: true,
				userId: true,
				status: true,
			},
		});

		if (!subject) {
			throw new Error("Subject profile not found");
		}

		if (subject.userId) {
			throw new Error("Cannot manage relations for a profile linked to a user");
		}

		if (subject.status !== COMMUNITY_PROFILE_STATUS.active) {
			throw new Error("Subject profile is not active");
		}

		const target = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.toId),
					operators.eq(fields.organizationId, organizationId)
				),
			columns: {
				id: true,
			},
		});

		if (!target) {
			throw new Error("Target profile not found");
		}

		const existingRelationship = await db.query.communityRelation.findFirst({
			where: (fields, operators) =>
				operators.or(
					operators.and(
						operators.eq(fields.fromId, data.subjectId),
						operators.eq(fields.toId, data.toId)
					),
					operators.and(
						operators.eq(fields.toId, data.subjectId),
						operators.eq(fields.fromId, data.toId)
					)
				),
			columns: {
				id: true,
			},
		});

		if (existingRelationship) {
			throw new Error("Relationship already exists between these profiles");
		}

		await db.insert(communityRelation).values({
			id: generatePrimaryKey(),
			fromId: data.subjectId,
			toId: data.toId,
			organizationId: organizationId,
			type: data.type,
			note: data.note,
			bloodRelation: data.bloodRelation,
		});

		await invalidateOrgGraph(organizationId);

		return {
			message: "Relationship added successfully",
		};
	});

// Owner/admin delete an outgoing relation from a userless, active profile.
export const deleteCommunityRelationFromProfile = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(
		z.object({
			subjectId: z.string().trim().min(1, "Subject profile is required"),
			relationId: z.string().trim().min(1, "Relation is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const canManageRelations = await auth.api.hasPermission({
			headers: getRequestHeaders(),
			body: {
				permissions: {
					communityProfile: ["manageRelations"],
				},
			},
		});

		if (!canManageRelations.success) {
			throw new Error("You do not have permission to manage relations");
		}

		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

		const subject = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.subjectId),
					operators.eq(fields.organizationId, organizationId)
				),
			columns: {
				id: true,
				userId: true,
				status: true,
			},
		});

		if (!subject) {
			throw new Error("Subject profile not found");
		}

		if (subject.userId) {
			throw new Error("Cannot manage relations for a profile linked to a user");
		}

		if (subject.status !== COMMUNITY_PROFILE_STATUS.active) {
			throw new Error("Subject profile is not active");
		}

		const relationship = await db.query.communityRelation.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.id, data.relationId),
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.fromId, data.subjectId)
				),
			columns: {
				id: true,
			},
		});

		if (!relationship) {
			throw new Error("Outgoing relation not found for this profile");
		}

		await db.delete(communityRelation).where(eq(communityRelation.id, relationship.id));

		await invalidateOrgGraph(organizationId);

		return {
			message: "Relationship deleted successfully",
		};
	});
