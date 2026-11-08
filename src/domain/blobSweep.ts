import { and, asc, eq, inArray, lt, not, or, sql, type SQL } from "drizzle-orm";
import { mediaBlob, post } from "@/db/app-schema";
import { communityProfile } from "@/db/schema";
import { BLOB_STATUS, type BlobOwnerKind } from "@/db/constants";
import { blobKey, pendingCutoff, variantsOf } from "./blob";
import type { BlobBucket } from "./blobStore";
import { IN_LIST_CHUNK, type QueryDb } from "./queries/db";

/** Subrequests (D1 statements + R2 calls) one run may spend (spec: Blobs > Sweep). */
export const SWEEP_SUBREQUEST_BUDGET = 40;

/** Subrequests one byte-delete page costs: select, R2 bulk delete, row delete. */
const PAGE_COST = 3;

/**
 * "Owner row still exists", per owner kind, as SQL over the `blob` row. A `Record` so a new kind
 * fails to compile until it says when its Blobs are orphaned.
 */
const OWNER_EXISTS: Record<BlobOwnerKind, SQL> = {
	profile: sql`exists (select 1 from ${communityProfile} where ${communityProfile.id} = ${mediaBlob.ownerId} and ${communityProfile.organizationId} = ${mediaBlob.organizationId})`,
	// Stub: nothing attaches to it yet. Photo Change Request (27).
	changeRequest: sql`1`,
	memory: sql`exists (select 1 from ${post} where ${post.id} = ${mediaBlob.ownerId} and ${post.organizationId} = ${mediaBlob.organizationId})`,
};

type Deps = {
	db: QueryDb;
	bucket: BlobBucket;
	now: () => Date;
	budget?: number;
	/** Blobs per byte-delete page; ids go in one `IN` list, so within D1's param cap. */
	pageSize?: number;
};

/**
 * Hourly cleanup (spec: Blobs > Sweep): expire `pending`, mark orphaned `attached` Blobs
 * `deleted`, then delete bytes and rows of `deleted` Blobs page by page until the budget runs out.
 * Nothing depends on it running. Never throws.
 */
export function makeBlobSweep({
	db,
	bucket,
	now,
	budget = SWEEP_SUBREQUEST_BUDGET,
	pageSize = IN_LIST_CHUNK,
}: Deps) {
	return {
		async run() {
			let spent = 0;
			const result = { expired: 0, orphaned: 0, purged: 0, subrequests: 0 };
			try {
				spent++;
				result.expired = (
					await db
						.update(mediaBlob)
						.set({ status: BLOB_STATUS.deleted })
						.where(
							and(
								eq(mediaBlob.status, BLOB_STATUS.pending),
								lt(mediaBlob.createdAt, pendingCutoff(now()))
							)
						)
						.returning({ id: mediaBlob.id })
				).length;

				spent++;
				result.orphaned = (
					await db
						.update(mediaBlob)
						.set({ status: BLOB_STATUS.deleted })
						.where(
							and(
								eq(mediaBlob.status, BLOB_STATUS.attached),
								or(
									...Object.entries(OWNER_EXISTS).map(([kind, exists]) =>
										and(eq(mediaBlob.ownerKind, kind as BlobOwnerKind), not(exists))
									)
								)
							)
						)
						.returning({ id: mediaBlob.id })
				).length;

				while (spent + PAGE_COST <= budget) {
					spent++;
					const page = await db
						.select({
							id: mediaBlob.id,
							organizationId: mediaBlob.organizationId,
							mediaKind: mediaBlob.mediaKind,
						})
						.from(mediaBlob)
						.where(eq(mediaBlob.status, BLOB_STATUS.deleted))
						.orderBy(asc(mediaBlob.createdAt), asc(mediaBlob.id))
						.limit(pageSize);
					if (page.length === 0) break;
					spent++;
					await bucket.delete(
						page.flatMap((b) =>
							variantsOf(b.mediaKind).map((v) => blobKey(b.organizationId, b.id, v))
						)
					);
					spent++;
					await db.delete(mediaBlob).where(
						and(
							inArray(
								mediaBlob.id,
								page.map((b) => b.id)
							),
							eq(mediaBlob.status, BLOB_STATUS.deleted)
						)
					);
					result.purged += page.length;
					if (page.length < pageSize) break;
				}
			} catch (error) {
				console.error("Blob sweep stopped; the rest waits for the next run", error);
			}
			result.subrequests = spent;
			return result;
		},
	};
}
