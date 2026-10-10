import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { communityRelation } from "@/db/app-schema";
import { count, eq } from "drizzle-orm";
import type { Actor } from "@/domain/permission";
import { profileChanges } from "@/lib/profileChanges";
import { relationTypeSchema } from "@/domain/relation";

const relationInput = z.object({
	type: relationTypeSchema,
	toId: z.string().trim().min(1, "Target profile is required"),
	note: z.string().optional(),
	bloodRelation: z.boolean().default(false).optional(),
});

const profileId = z.string().trim().min(1, "Profile is required");

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

/** Outgoing relation of `profileId` (own linked profile or, for owner/admin, a Userless one). */
export const addRelation = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(relationInput.extend({ profileId }))
	.handler(({ context, data }) =>
		profileChanges.submit(context.actor, {
			kind: "relation_add",
			profileId: data.profileId,
			toId: data.toId,
			type: data.type,
			note: data.note?.trim() || null,
			bloodRelation: data.bloodRelation ?? false,
		})
	);

/** Outgoing only: incoming relations belong to the counterpart. */
export const removeRelation = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId, relationId: z.string().trim().min(1, "Relation is required") }))
	.handler(({ context, data }) =>
		profileChanges.submit(context.actor, { kind: "relation_remove", ...data })
	);
