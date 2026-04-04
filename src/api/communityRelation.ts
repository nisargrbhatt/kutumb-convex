import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import { communityRelation } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

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

export const addMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
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

		return {
			message: "Relationship added successfully",
		};
	});

export const deleteMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
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

		return {
			message: "Relationship deleted successfully",
		};
	});
