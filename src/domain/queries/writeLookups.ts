import { and, eq } from "drizzle-orm";
import { communityAddress, communityProfile, communityRelation } from "@/db/app-schema";
import { COMMUNITY_PROFILE_STATUS } from "@/db/constants";
import type { QueryDb } from "./db";

/**
 * Edge lookups behind the relation/address write tools' idempotency + hints. Read-only; the
 * seam (`makeProfileChanges`) still validates and decides on its own.
 */

/** The relation `fromId → toId` (outgoing from `fromId`), if any, once `toId` is an active profile. */
export async function findOutgoingRelation(
	db: QueryDb,
	organizationId: string,
	fromId: string,
	toId: string
) {
	const target = await db.query.communityProfile.findFirst({
		where: and(
			eq(communityProfile.id, toId),
			eq(communityProfile.organizationId, organizationId),
			eq(communityProfile.status, COMMUNITY_PROFILE_STATUS.active)
		),
		columns: { id: true },
	});
	if (!target) return undefined;
	return db.query.communityRelation.findFirst({
		where: and(
			eq(communityRelation.organizationId, organizationId),
			eq(communityRelation.fromId, fromId),
			eq(communityRelation.toId, toId)
		),
	});
}

/** A relation row by id within the org, whichever end the subject is. */
export function findRelationById(db: QueryDb, organizationId: string, relationId: string) {
	return db.query.communityRelation.findFirst({
		where: and(
			eq(communityRelation.id, relationId),
			eq(communityRelation.organizationId, organizationId)
		),
	});
}

export function listProfileAddresses(db: QueryDb, profileId: string) {
	return db.query.communityAddress.findMany({
		where: eq(communityAddress.communityProfileId, profileId),
	});
}

export function findProfileAddress(db: QueryDb, profileId: string, addressId: string) {
	return db.query.communityAddress.findFirst({
		where: and(
			eq(communityAddress.id, addressId),
			eq(communityAddress.communityProfileId, profileId)
		),
	});
}
