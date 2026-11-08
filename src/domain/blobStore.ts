import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";
import { mediaBlob } from "@/db/app-schema";
import {
	BLOB_MEDIA_KIND,
	BLOB_STATUS,
	BLOB_VARIANT,
	BLOB_VIDEO_CONTENT_TYPE,
	enumValues,
	type BlobMediaKind,
	type BlobVariant,
} from "@/db/constants";
import { blobKey, variantsOf } from "./blob";
import { AppError } from "./errors";
import { IMAGE_VARIANT_MAX_BYTES, VIDEO_MAX_BYTES, type makeLimits } from "./limits";
import type { Actor } from "./permission";
import type { QueryDb } from "./queries/db";

/** R2 object metadata the blob code reads. */
export type BlobObject = {
	size: number;
	httpEtag: string;
	httpMetadata?: { contentType?: string };
};
/** R2's `R2Range`. */
export type BlobRange = { offset: number; length?: number } | { suffix: number };
export type BlobObjectBody = BlobObject & {
	body: ReadableStream;
	arrayBuffer(): Promise<ArrayBuffer>;
};

/** The subset of the `BLOBS` R2 binding blob code uses (structural, so tests can fake it). */
export interface BlobBucket {
	put(
		key: string,
		value: ReadableStream | ArrayBuffer | ArrayBufferView,
		options?: { httpMetadata?: { contentType?: string }; sha256?: string }
	): Promise<BlobObject | null>;
	get(key: string, options?: { range?: BlobRange }): Promise<BlobObjectBody | null>;
	head(key: string): Promise<BlobObject | null>;
	delete(keys: string | string[]): Promise<void>;
}

/** Body cap of one variant `PUT`. */
export const variantMaxBytes = (variant: BlobVariant) =>
	variant === BLOB_VARIANT.video ? VIDEO_MAX_BYTES : IMAGE_VARIANT_MAX_BYTES;

/** Most a Blob of `kind` may declare: every variant at its cap. */
export const maxDeclaredBytes = (kind: BlobMediaKind) =>
	variantsOf(kind).reduce((n, v) => n + variantMaxBytes(v), 0);

export const startUploadInput = z.object({
	mediaKind: z.enum(enumValues(BLOB_MEDIA_KIND)),
	size: z.number().int().positive(),
	/** Video only: the type the browser's atom walk read. The Worker checks it on `PUT`. */
	contentType: z.enum(enumValues(BLOB_VIDEO_CONTENT_TYPE)).optional(),
});
export type StartUploadInput = z.infer<typeof startUploadInput>;

/** Ids per discard call: a Drawer holds at most a handful. */
export const discardUploadsInput = z.object({ blobIds: z.array(z.string()).max(20) });

/** Every R2 key a Blob of `kind` could have, landed or not. */
const allKeys = (organizationId: string, blobId: string, kind: BlobMediaKind) =>
	variantsOf(kind).map((v) => blobKey(organizationId, blobId, v));

type Deps = {
	db: QueryDb;
	bucket: BlobBucket;
	limits: Pick<ReturnType<typeof makeLimits>, "assertPendingUploadSlot">;
	now: () => Date;
	newId: () => string;
};

/** Start and discard (spec: Upload step 1, Blobs > Lifecycle > Discard). */
export function makeBlobStore({ db, bucket, limits, now, newId }: Deps) {
	return {
		/** Reserves `size` in a new `pending` Blob; the browser then `PUT`s each variant. */
		async start(actor: Actor, { mediaKind, size, contentType }: StartUploadInput) {
			// Video's type is fixed at start, so `put()` can store it as `httpMetadata`.
			if ((mediaKind === BLOB_MEDIA_KIND.memoryVideo) !== (contentType !== undefined)) {
				throw new AppError("Invalid", "Only .mov and .mp4 videos can be added");
			}
			if (size > maxDeclaredBytes(mediaKind)) {
				throw new AppError("Invalid", "This file is too large");
			}
			const at = now();
			await limits.assertPendingUploadSlot(actor.organizationId, actor.userId, size, at);
			const blobId = newId();
			await db.insert(mediaBlob).values({
				id: blobId,
				organizationId: actor.organizationId,
				mediaKind,
				status: BLOB_STATUS.pending,
				uploadedByUserId: actor.userId,
				size,
				variants: {},
				contentType: contentType ?? null,
				createdAt: at,
			});
			return { blobId };
		},

		/**
		 * Drops the Actor's own `pending` Blobs among `blobIds`; anything else is ignored, so a stale
		 * or repeated call can't touch attached media. Row goes `deleted` first (leaves the pending
		 * sum at once), then bytes, then the row. A failed byte delete leaves the `deleted` row for the
		 * sweep's retry.
		 */
		async discard(actor: Actor, blobIds: string[]) {
			if (blobIds.length === 0) return { discarded: [] as string[] };
			const rows = await db
				.update(mediaBlob)
				.set({ status: BLOB_STATUS.deleted })
				.where(
					and(
						inArray(mediaBlob.id, blobIds),
						eq(mediaBlob.organizationId, actor.organizationId),
						eq(mediaBlob.uploadedByUserId, actor.userId),
						eq(mediaBlob.status, BLOB_STATUS.pending)
					)
				)
				.returning({ id: mediaBlob.id, mediaKind: mediaBlob.mediaKind });
			await purgeBlobs({ db, bucket }, actor.organizationId, rows);
			return { discarded: rows.map((r) => r.id) };
		},
	};
}

/**
 * Bytes of Blobs already marked `deleted`, then their rows (spec: Blobs > Lifecycle > Delete).
 * Never throws: a failed byte delete leaves the `deleted` rows for the sweep's retry.
 */
export async function purgeBlobs(
	{ db, bucket }: { db: QueryDb; bucket: BlobBucket },
	organizationId: string,
	blobs: { id: string; mediaKind: BlobMediaKind }[]
) {
	if (blobs.length === 0) return;
	try {
		await bucket.delete(blobs.flatMap((b) => allKeys(organizationId, b.id, b.mediaKind)));
		await db.delete(mediaBlob).where(
			and(
				inArray(
					mediaBlob.id,
					blobs.map((b) => b.id)
				),
				eq(mediaBlob.organizationId, organizationId),
				eq(mediaBlob.status, BLOB_STATUS.deleted)
			)
		);
	} catch (error) {
		console.error("Blob byte delete failed; left for the sweep", error);
	}
}
