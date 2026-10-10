import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { profileChanges } from "@/lib/profileChanges";
import { relationTypeSchema } from "@/domain/relation";
import { countMyRelations, getMyRelationships } from "@/domain/queries/profiles";

const relationInput = z.object({
	type: relationTypeSchema,
	toId: z.string().trim().min(1, "Target profile is required"),
	note: z.string().optional(),
	bloodRelation: z.boolean().default(false).optional(),
});

const profileId = z.string().trim().min(1, "Profile is required");

export const getMyCommunityRelationships = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(({ context }) => getMyRelationships(db, context.actor));

export const getMyIncomingRelationCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(({ context }) => countMyRelations(db, context.actor, "in"));

export const getMyOutgoingRelationCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(({ context }) => countMyRelations(db, context.actor, "out"));

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
