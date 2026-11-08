import { and, inArray } from "drizzle-orm";
import { communityProfile } from "@/db/app-schema";
import { fullName, initials } from "@/domain/communityProfile";
import { nameInitials, type AuthorDisplay } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";
import { visibleProfileWhere } from "./profiles";

/**
 * Author display for Posts, comments and likers (spec § Reading). Two halves so the query can ride
 * a caller's `db.batch`: `authorProfilesQuery` reads the linked Community Profiles the viewer may
 * see (`visibleProfileWhere`), `authorDisplay` turns its rows into a lookup with the snapshot
 * fallback. Callers pass at most a page of user ids (well under D1's 100-param cap).
 */
export const authorProfilesQuery = (db: QueryDb, viewer: Actor, userIds: readonly string[]) =>
	db
		.select({
			id: communityProfile.id,
			userId: communityProfile.userId,
			firstName: communityProfile.firstName,
			middleName: communityProfile.middleName,
			lastName: communityProfile.lastName,
			photoBlobId: communityProfile.photoBlobId,
		})
		.from(communityProfile)
		.where(and(visibleProfileWhere(viewer), inArray(communityProfile.userId, [...userIds])));

export type AuthorProfileRow = Awaited<ReturnType<typeof authorProfilesQuery>>[number];

/** `(userId, snapshotName) → AuthorDisplay`: the visible profile, else the snapshot. */
export function authorDisplay(rows: readonly AuthorProfileRow[]) {
	const byUser = new Map(rows.flatMap((r) => (r.userId ? [[r.userId, r] as const] : [])));
	return (userId: string, snapshotName: string): AuthorDisplay => {
		const p = byUser.get(userId);
		if (!p)
			return {
				name: snapshotName,
				initials: nameInitials(snapshotName),
				profileId: null,
				photoBlobId: null,
			};
		return {
			name: fullName(p),
			initials: initials(p),
			profileId: p.id,
			photoBlobId: p.photoBlobId,
		};
	};
}
