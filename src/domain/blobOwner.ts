import { sql, type SQL } from "drizzle-orm";
import { changeRequest, communityProfile, mediaBlob, post } from "@/db/schema";
import {
	CHANGE_REQUEST_STATUS,
	COMMUNITY_PROFILE_STATUS,
	type BlobOwnerKind,
} from "@/db/constants";

const postExists = sql`exists (select 1 from ${post} where ${post.id} = ${mediaBlob.ownerId} and ${post.organizationId} = ${mediaBlob.organizationId})`;

/**
 * Owner-row SQL over the `blob` row, per owner kind. A `Record` so a new kind fails to compile in
 * both the sweep and the gate until it says when its Blobs are orphaned and who may see them.
 *
 * - `exists`: owner row still exists (sweep marks the rest `deleted`).
 * - `memberVisible`: any member may see the `attached` Blob (gate's unrestricted set); `null` means
 *   always restricted, so the gate checks the owner per request.
 */
export const BLOB_OWNER_SQL: Record<BlobOwnerKind, { exists: SQL; memberVisible: SQL | null }> = {
	profile: {
		exists: sql`exists (select 1 from ${communityProfile} where ${communityProfile.id} = ${mediaBlob.ownerId} and ${communityProfile.organizationId} = ${mediaBlob.organizationId})`,
		memberVisible: sql`exists (select 1 from ${communityProfile} where ${communityProfile.id} = ${mediaBlob.ownerId} and ${communityProfile.organizationId} = ${mediaBlob.organizationId} and ${communityProfile.status} = ${COMMUNITY_PROFILE_STATUS.active})`,
	},
	// A `photo` request's proposed Blob: only while the request is pending (approve moves it to the
	// profile; every other close marks it deleted, so a closed owner means a missed mark).
	changeRequest: {
		exists: sql`exists (select 1 from ${changeRequest} where ${changeRequest.id} = ${mediaBlob.ownerId} and ${changeRequest.organizationId} = ${mediaBlob.organizationId} and ${changeRequest.status} = ${CHANGE_REQUEST_STATUS.pending})`,
		memberVisible: null,
	},
	// Memory media (image or video) is open to members while its Memory is in the same org.
	memory: { exists: postExists, memberVisible: postExists },
};
