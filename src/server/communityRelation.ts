import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { communityRelation } from "@/db/app-schema";
import { generatePrimaryKey } from "@/lib/generate";
import { count, eq } from "drizzle-orm";
import { invalidateOrgGraph } from "@/lib/communityGraphCache";
import { AppError } from "@/domain/errors";
import { assertCan, type Actor } from "@/domain/permission";
import { relationTypeSchema } from "@/domain/relation";

const relationInput = z.object({
	type: relationTypeSchema,
	toId: z.string().trim().min(1, "Target profile is required"),
	note: z.string().optional(),
	bloodRelation: z.boolean().default(false).optional(),
});

const counterpartColumns = {
	id: true,
	firstName: true,
	middleName: true,
	lastName: true,
	nickName: true,
} as const;

async function findMyProfileId({ organizationId, userId }: Actor) {
	const profile = await db.query.communityProfile.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.organizationId, organizationId),
				operators.eq(fields.userId, userId)
			),
		columns: { id: true },
	});
	return profile?.id ?? null;
}

async function requireMyProfileId(actor: Actor) {
	const id = await findMyProfileId(actor);
	if (!id) {
		throw new AppError("NotFound", "Community profile not found");
	}
	return id;
}

// Admin-managed subjects: in org, userless (linked users manage their own), active.
async function assertManageableSubject(actor: Actor, subjectId: string) {
	assertCan(actor, { communityProfile: ["manageRelations"] });

	const subject = await db.query.communityProfile.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.id, subjectId),
				operators.eq(fields.organizationId, actor.organizationId)
			),
		columns: { id: true, userId: true, status: true },
	});

	if (!subject) {
		throw new AppError("NotFound", "Subject profile not found");
	}

	if (subject.userId) {
		throw new Error("Cannot manage relations for a profile linked to a user");
	}

	if (subject.status !== COMMUNITY_PROFILE_STATUS.active) {
		throw new Error("Subject profile is not active");
	}
}

/** Shared insert: self-link check, active in-org target, one relation per pair (either direction). */
async function insertRelation(
	{ organizationId }: Actor,
	data: z.infer<typeof relationInput> & { fromId: string }
) {
	if (data.fromId === data.toId) {
		throw new Error("A profile cannot have a relation to itself");
	}

	const target = await db.query.communityProfile.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.id, data.toId),
				operators.eq(fields.organizationId, organizationId),
				operators.eq(fields.status, COMMUNITY_PROFILE_STATUS.active)
			),
		columns: { id: true },
	});

	if (!target) {
		throw new AppError("NotFound", "Target profile not found");
	}

	const existing = await db.query.communityRelation.findFirst({
		where: (fields, operators) =>
			operators.or(
				operators.and(
					operators.eq(fields.fromId, data.fromId),
					operators.eq(fields.toId, data.toId)
				),
				operators.and(
					operators.eq(fields.toId, data.fromId),
					operators.eq(fields.fromId, data.toId)
				)
			),
		columns: { id: true },
	});

	if (existing) {
		throw new Error("Relationship already exists between these profiles");
	}

	await db.insert(communityRelation).values({
		id: generatePrimaryKey(),
		fromId: data.fromId,
		toId: data.toId,
		organizationId,
		type: data.type,
		note: data.note,
		bloodRelation: data.bloodRelation,
	});

	await invalidateOrgGraph(organizationId);

	return { message: "Relationship added successfully" };
}

/** Shared delete: only outgoing relations of `fromId` (incoming are owned by the counterpart). */
async function deleteOutgoingRelation(
	{ organizationId }: Actor,
	data: { fromId: string; relationId: string }
) {
	const relationship = await db.query.communityRelation.findFirst({
		where: (fields, operators) =>
			operators.and(
				operators.eq(fields.id, data.relationId),
				operators.eq(fields.organizationId, organizationId),
				operators.eq(fields.fromId, data.fromId)
			),
		columns: { id: true },
	});

	if (!relationship) {
		throw new AppError("NotFound", "Relationship not found");
	}

	await db.delete(communityRelation).where(eq(communityRelation.id, relationship.id));

	await invalidateOrgGraph(organizationId);

	return { message: "Relationship deleted successfully" };
}

export const getMyCommunityRelationships = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const profileId = await findMyProfileId(context.actor);

		if (!profileId) {
			return { profileId, outgoing: [], incoming: [] };
		}

		const [outgoing, incoming] = await Promise.all([
			db.query.communityRelation.findMany({
				where: (fields, operators) => operators.eq(fields.fromId, profileId),
				columns: { organizationId: false },
				with: { toCommunityProfile: { columns: counterpartColumns } },
			}),
			// Type shown as stored (no inversion — ADR 0001).
			db.query.communityRelation.findMany({
				where: (fields, operators) => operators.eq(fields.toId, profileId),
				columns: { organizationId: false },
				with: { fromCommunityProfile: { columns: counterpartColumns } },
			}),
		]);

		return { profileId, outgoing, incoming };
	});

export const getMyIncomingRelationCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const profileId = await findMyProfileId(context.actor);

		if (!profileId) {
			return 0;
		}

		const [result] = await db
			.select({ total: count() })
			.from(communityRelation)
			.where(eq(communityRelation.toId, profileId));

		return result?.total ?? 0;
	});

export const getMyOutgoingRelationCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const profileId = await findMyProfileId(context.actor);

		if (!profileId) {
			return 0;
		}

		const [result] = await db
			.select({ total: count() })
			.from(communityRelation)
			.where(eq(communityRelation.fromId, profileId));

		return result?.total ?? 0;
	});

export const addMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(relationInput)
	.handler(async ({ context, data }) => {
		const fromId = await requireMyProfileId(context.actor);
		return insertRelation(context.actor, { ...data, fromId });
	});

export const deleteMyCommunityRelationship = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			id: z.string().trim().min(1, "Relationship ID is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const fromId = await requireMyProfileId(context.actor);
		return deleteOutgoingRelation(context.actor, { fromId, relationId: data.id });
	});

// Owner/admin add an outgoing relation on behalf of a userless, active profile.
export const addCommunityRelationToProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		relationInput.extend({
			subjectId: z.string().trim().min(1, "Subject profile is required"),
		})
	)
	.handler(async ({ context, data: { subjectId, ...data } }) => {
		await assertManageableSubject(context.actor, subjectId);
		return insertRelation(context.actor, { ...data, fromId: subjectId });
	});

// Owner/admin delete an outgoing relation from a userless, active profile.
export const deleteCommunityRelationFromProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			subjectId: z.string().trim().min(1, "Subject profile is required"),
			relationId: z.string().trim().min(1, "Relation is required"),
		})
	)
	.handler(async ({ context, data }) => {
		await assertManageableSubject(context.actor, data.subjectId);
		return deleteOutgoingRelation(context.actor, {
			fromId: data.subjectId,
			relationId: data.relationId,
		});
	});
