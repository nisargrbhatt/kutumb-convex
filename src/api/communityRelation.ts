import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { getFullUserContextCached } from "./auth";
import { db } from "@/db";
import { queryOptions } from "@tanstack/react-query";
import { COMMUNITY_RELATION_TYPE } from "@/db/constants";
import type { PrimaryKey } from "@/db/schema";
import { communityRelation } from "@/db/schema";
import { generatePrimaryKey } from "@/lib/generate";
import { eq } from "drizzle-orm";

export const getMyCommunityRelationships = createServerFn({ method: "GET" })
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
		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
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

export const getMyCommunityRelationshipsQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-my-community-relationships", props.slug],
		queryFn: async ({ signal }) => {
			const result = await getMyCommunityRelationships({
				data: {
					slug: props.slug,
				},
				signal,
			});
			return result;
		},
	});

export const addMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			relationship: z.object({
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
			throw new Error("Organization not found or you are not a member");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
				),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw new Error("Community profile not found");
		}

		if (profile.id === data.relationship.toId) {
			throw new Error("You cannot add a relationship to yourself");
		}

		await db.insert(communityRelation).values({
			id: generatePrimaryKey("communityRelation"),
			fromId: profile.id,
			toId: data.relationship.toId as PrimaryKey<"communityProfile">,
			organizationId: organizationId,
			type: data.relationship.type,
			note: data.relationship.note,
			bloodRelation: data.relationship.bloodRelation,
		});

		return {
			message: "Relationship added successfully",
		};
	});

export const deleteMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			slug: z.string().trim().min(1, "Slug is required"),
			id: z.string().trim().min(1, "Relationship ID is required"),
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
			throw new Error("Organization not found or you are not a member");
		}

		const profile = await db.query.communityProfile.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, organizationId),
					operators.eq(fields.profileId, profileId)
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
				operators.and(
					operators.eq(fields.id, data.id as PrimaryKey<"communityRelation">),
					operators.eq(fields.fromId, profile.id)
				),
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
