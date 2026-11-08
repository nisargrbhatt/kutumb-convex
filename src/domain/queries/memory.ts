import type { BatchItem } from "drizzle-orm/batch";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { mediaBlob, post, postMemory, postMemoryMedia } from "@/db/app-schema";
import { BLOB_MEDIA_KIND, BLOB_OWNER_KIND, BLOB_STATUS, POST_KIND } from "@/db/constants";
import { canAttach, pendingCutoff } from "@/domain/blob";
import { AppError } from "@/domain/errors";
import type { FeedView, MemoryInput } from "@/domain/feed";
import { canEditPost } from "@/domain/feedPolicy";
import { isGalleryMediaKind, parseGallery } from "@/domain/gallery";
import { parseDescription } from "@/domain/memoryDescription";
import type { Actor } from "@/domain/permission";
import type { BatchDb } from "@/domain/profileChanges";
import { batchGuard, isBatchGuardTrip } from "./batchGuard";
import type { QueryDb } from "./db";
import { insertPostBase, loadPostForWrite, type PurgeBlobs } from "./postBase";

/**
 * A Memory's attached gallery, in order, as one correlated JSON column, so `load` stays one batch
 * statement. Param-less (raw) on purpose: it rides `db.batch`.
 */
const galleryColumn = sql
	.raw(
		`(select json_group_array(json_object('blobId', b."id", 'mediaKind', b."mediaKind", 'width', b."width", 'height', b."height", 'durationMs', b."durationMs", 'contentType', b."contentType", 'hasPoster', json_extract(b."variants", '$.poster') is not null, 'position', m."position")) from "postMemoryMedia" m join "blob" b on b."id" = m."blobId" where m."postId" = "postMemory"."postId" and b."status" = '${BLOB_STATUS.attached}')`
	)
	.mapWith(parseGallery);

/** Memory's half of the Feed read seam: cards read `descriptionText`, detail `descriptionDoc`. */
export const memoryKind = {
	load: (db: QueryDb, postIds: string[], view: FeedView) =>
		view === "card"
			? db
					.select({
						postId: postMemory.postId,
						title: postMemory.title,
						descriptionText: postMemory.descriptionText,
						media: galleryColumn,
					})
					.from(postMemory)
					.where(inArray(postMemory.postId, postIds))
			: db
					.select({
						postId: postMemory.postId,
						title: postMemory.title,
						descriptionDoc: postMemory.descriptionDoc,
						media: galleryColumn,
					})
					.from(postMemory)
					.where(inArray(postMemory.postId, postIds)),
};

export type MemoryDeps = {
	db: BatchDb;
	now?: () => Date;
	newId?: () => string;
	/** Byte deletes of Blobs a save marked `deleted`, after the batch (prod: `waitUntil`). */
	purgeBlobs?: PurgeBlobs;
};

const INVALID_UPLOAD = "An upload is no longer valid. Remove it and add it again.";
const CONFLICT = "This memory changed since you opened it. Close and try again.";

/**
 * Attach rule for new gallery media (spec: Blobs > Lifecycle > Attach): every id a `pending`,
 * unexpired, fully landed gallery Blob the Actor uploaded in their active org. Checked before the
 * batch for a clear error; the batch re-checks with a conditional UPDATE and a guard.
 */
async function assertAttachable(db: QueryDb, actor: Actor, ids: string[], now: Date) {
	if (ids.length === 0) return;
	const rows = await db
		.select()
		.from(mediaBlob)
		.where(and(inArray(mediaBlob.id, ids), eq(mediaBlob.organizationId, actor.organizationId)));
	const ok = new Set(
		rows
			.filter(
				(r) =>
					isGalleryMediaKind(r.mediaKind) && canAttach(r, { actor, mediaKind: r.mediaKind, now })
			)
			.map((r) => r.id)
	);
	if (!ids.every((id) => ok.has(id))) throw new AppError("Invalid", INVALID_UPLOAD);
}

/** Conditional attach of `ids` to Memory `postId` plus its guard; size becomes the landed sum. */
function attachStatements(db: BatchDb, actor: Actor, postId: string, ids: string[], now: Date) {
	if (ids.length === 0) return [];
	return [
		db
			.update(mediaBlob)
			.set({
				status: BLOB_STATUS.attached,
				ownerKind: BLOB_OWNER_KIND.memory,
				ownerId: postId,
				size: sql`(select coalesce(sum(value), 0) from json_each(${mediaBlob.variants}))`,
			})
			.where(
				and(
					inArray(mediaBlob.id, ids),
					eq(mediaBlob.organizationId, actor.organizationId),
					eq(mediaBlob.uploadedByUserId, actor.userId),
					eq(mediaBlob.status, BLOB_STATUS.pending),
					gte(mediaBlob.createdAt, pendingCutoff(now))
				)
			),
		batchGuard(db, ids.length),
	];
}

const galleryRows = (db: BatchDb, postId: string, ids: string[]) =>
	ids.length === 0
		? []
		: [
				db
					.insert(postMemoryMedia)
					.values(ids.map((blobId, position) => ({ postId, blobId, position }))),
			];

/**
 * Any Org Member posts a Memory; live at once. Only `title`, the description source and gallery
 * Blob ids are taken from the client: `descriptionDoc` / `descriptionText` are derived here. A
 * description that fails the rules is `Invalid` with the same message Preview shows. Gallery Blobs
 * attach in the same batch.
 */
export async function createMemory(
	{ db, now = () => new Date(), newId = () => crypto.randomUUID().replaceAll("-", "") }: MemoryDeps,
	actor: Actor,
	authorName: string,
	input: MemoryInput
) {
	const parsed = parseDescription(input.description);
	if (!parsed.ok) throw new AppError("Invalid", parsed.error);
	const media = input.media ?? [];
	const at = now();
	await assertAttachable(db, actor, media, at);
	const postId = newId();
	try {
		await db.batch([
			insertPostBase(db, {
				id: postId,
				kind: POST_KIND.memory,
				author: actor,
				authorName,
				createdAt: at,
			}),
			db.insert(postMemory).values({
				postId,
				title: input.title,
				description: parsed.source,
				descriptionDoc: parsed.doc,
				descriptionText: parsed.text,
			}),
			...attachStatements(db, actor, postId, media, at),
			...galleryRows(db, postId, media),
		]);
	} catch (error) {
		if (isBatchGuardTrip(error)) throw new AppError("Invalid", INVALID_UPLOAD);
		throw error;
	}
	return { postId };
}

/** Attached gallery of one Memory, in order. */
async function loadGallery(db: QueryDb, postId: string) {
	const [row] = await db
		.select({ media: galleryColumn })
		.from(postMemory)
		.where(eq(postMemory.postId, postId))
		.limit(1);
	return row?.media ?? [];
}

/** Edit loads the source of truth and the attached gallery: author only. */
export async function getMemoryForEdit(db: QueryDb, actor: Actor, postId: string) {
	const row = await loadPostForWrite(db, actor, postId, POST_KIND.memory);
	if (!canEditPost(actor, row)) throw new AppError("Forbidden", "Only the author can edit");
	const [m] = await db
		.select({
			title: postMemory.title,
			description: postMemory.description,
			media: galleryColumn,
		})
		.from(postMemory)
		.where(eq(postMemory.postId, row.id))
		.limit(1);
	if (!m) throw new AppError("NotFound", "Post not found");
	return { title: m.title, description: m.description ?? "", media: m.media };
}

/**
 * Author edits title, description and gallery, any time while an Org Member. Re-parses the
 * description (derived fields Worker-written) and sets `editedAt`; `createdAt` stays, so the Feed
 * order does too. Gallery: new Blobs attach, removed `attached` ones are marked `deleted` (bytes go
 * after the batch), order is rewritten. Media kept or removed must still belong to this Memory, or
 * the save is a `Conflict`. Otherwise last write wins.
 */
export async function updateMemory(
	{ db, now = () => new Date(), purgeBlobs }: MemoryDeps,
	actor: Actor,
	postId: string,
	input: MemoryInput
) {
	const row = await loadPostForWrite(db, actor, postId, POST_KIND.memory);
	if (!canEditPost(actor, row)) throw new AppError("Forbidden", "Only the author can edit");
	const parsed = parseDescription(input.description);
	if (!parsed.ok) throw new AppError("Invalid", parsed.error);

	const at = now();
	const media = input.media ?? [];
	const current = await db
		.select({ blobId: postMemoryMedia.blobId, mediaKind: mediaBlob.mediaKind })
		.from(postMemoryMedia)
		.leftJoin(mediaBlob, eq(mediaBlob.id, postMemoryMedia.blobId))
		.where(eq(postMemoryMedia.postId, row.id));
	const before = current.map((r) => r.blobId);
	const added = media.filter((id) => !before.includes(id));
	const removed = current.filter((r) => !media.includes(r.blobId));
	await assertAttachable(db, actor, added, at);

	const ownedHere = and(
		eq(mediaBlob.organizationId, actor.organizationId),
		eq(mediaBlob.status, BLOB_STATUS.attached),
		eq(mediaBlob.ownerKind, BLOB_OWNER_KIND.memory),
		eq(mediaBlob.ownerId, row.id)
	);
	const statements: BatchItem<"sqlite">[] = [];
	if (before.length > 0) {
		// Every current item is still this Memory's: a save racing another save can't resurrect
		// media that one already removed.
		statements.push(
			db
				.update(mediaBlob)
				.set({ ownerId: row.id })
				.where(and(inArray(mediaBlob.id, before), ownedHere)),
			batchGuard(db, before.length)
		);
	}
	if (removed.length > 0) {
		statements.push(
			db
				.update(mediaBlob)
				.set({ status: BLOB_STATUS.deleted })
				.where(
					and(
						inArray(
							mediaBlob.id,
							removed.map((r) => r.blobId)
						),
						ownedHere
					)
				)
		);
	}
	statements.push(...attachStatements(db, actor, row.id, added, at));
	try {
		await db.batch([
			db.update(post).set({ editedAt: at }).where(eq(post.id, row.id)),
			db
				.update(postMemory)
				.set({
					title: input.title,
					description: parsed.source,
					descriptionDoc: parsed.doc,
					descriptionText: parsed.text,
				})
				.where(eq(postMemory.postId, row.id)),
			...statements,
			db.delete(postMemoryMedia).where(eq(postMemoryMedia.postId, row.id)),
			...galleryRows(db, row.id, media),
		]);
	} catch (error) {
		if (!isBatchGuardTrip(error)) throw error;
		const still = (await loadGallery(db, row.id)).map((m) => m.blobId);
		const changed = still.length !== before.length || before.some((id) => !still.includes(id));
		throw new AppError(changed ? "Conflict" : "Invalid", changed ? CONFLICT : INVALID_UPLOAD);
	}
	if (removed.length > 0 && purgeBlobs) {
		await purgeBlobs(
			actor.organizationId,
			removed.map((r) => ({
				id: r.blobId,
				mediaKind: r.mediaKind ?? BLOB_MEDIA_KIND.memoryImage,
			}))
		);
	}
	return { postId: row.id };
}
