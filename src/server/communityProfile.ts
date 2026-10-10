import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { db } from "@/db";
import { CHANGE_REQUEST_STATUS, COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import { changeRequest, communityProfile } from "@/db/app-schema";
import { and, count, eq } from "drizzle-orm";
import {
	extractSubgraph,
	getOrgGraphBlob,
	resolveAnchorId,
	searchProfiles,
} from "@/lib/communityGraphCache";
import { assertCan } from "@/domain/permission";
import { communityProfileInput, memberFilterSchema } from "@/domain/communityProfile";
import { getCommunityProfileDetail, listCommunityMembers } from "@/domain/queries/profiles";
import { profileChanges } from "@/lib/profileChanges";

const profileId = z.string().trim().min(1, "Profile is required");

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

/** Create a profile: `self` → the Actor's own linked profile; otherwise a Userless Profile. */
export const createProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ self: z.boolean(), profile: communityProfileInput }))
	.handler(({ context, data }) => {
		if (!data.self) assertCan(context.actor, { communityProfile: ["create"] });
		return profileChanges.submit(context.actor, { kind: "create", ...data });
	});

/** Info edit; `expectedVersion` = the profile's `version` when the form loaded. */
export const updateProfileInfo = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			profileId,
			expectedVersion: z.number().int().min(0),
			profile: communityProfileInput,
		})
	)
	.handler(({ context, data }) => profileChanges.submit(context.actor, { kind: "info", ...data }));

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
	.handler(({ context, data }) => listCommunityMembers(db, context.actor, data));

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
	.handler(({ context, data }) => getCommunityProfileDetail(db, context.actor, data.id));

export const reassignProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId, userId: z.string().trim().min(1, "User is required") }))
	.handler(({ context, data }) =>
		profileChanges.reassign(context.actor, data.profileId, data.userId)
	);

export const deactivateProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId }))
	.handler(({ context, data }) => profileChanges.deactivate(context.actor, data.profileId));

export const reactivateProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId }))
	.handler(({ context, data }) => profileChanges.reactivate(context.actor, data.profileId));

/** Owner-only hard delete. */
export const deleteProfile = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId }))
	.handler(({ context, data }) => profileChanges.remove(context.actor, data.profileId));

/** Pending Change Requests of one profile (owner/admin): lifecycle confirm copy. */
export const getPendingRequestCount = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(z.object({ profileId }))
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { changeRequest: ["review"] });
		const [result] = await db
			.select({ total: count() })
			.from(changeRequest)
			.where(
				and(
					eq(changeRequest.organizationId, context.actor.organizationId),
					eq(changeRequest.profileId, data.profileId),
					eq(changeRequest.status, CHANGE_REQUEST_STATUS.pending)
				)
			);
		return result?.total ?? 0;
	});
