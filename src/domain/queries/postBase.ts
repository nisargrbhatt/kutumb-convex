import { and, eq } from "drizzle-orm";
import { post } from "@/db/app-schema";
import type { PostKind } from "@/db/constants";
import { AppError } from "@/domain/errors";
import { canRemovePost } from "@/domain/feedPolicy";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

/**
 * Feed helper for each kind's create function: the `post` base row as a batch statement, so the
 * kind writes its own row in the same `db.batch`. There is no generic `create` (spec § Seam).
 */
export const insertPostBase = (
	db: QueryDb,
	p: { id: string; kind: PostKind; author: Actor; authorName: string; createdAt: Date }
) =>
	db.insert(post).values({
		id: p.id,
		organizationId: p.author.organizationId,
		kind: p.kind,
		authorUserId: p.author.userId,
		authorName: p.authorName,
		createdAt: p.createdAt,
	});

/**
 * Every Feed write starts here: the Post by id + `actor.organizationId`. Another org's Post (or an
 * unknown id, or a different kind when `kind` is given) is `NotFound` before any policy runs.
 */
export async function loadPostForWrite(db: QueryDb, actor: Actor, postId: string, kind?: PostKind) {
	const [row] = await db
		.select({ id: post.id, kind: post.kind, authorUserId: post.authorUserId })
		.from(post)
		.where(and(eq(post.id, postId), eq(post.organizationId, actor.organizationId)))
		.limit(1);
	if (!row || (kind && row.kind !== kind)) throw new AppError("NotFound", "Post not found");
	return row;
}

/**
 * Remove a Post: author or owner/admin. Hard delete, kind rows (and later likes, comments, media)
 * go by FK cascade. No undo, no Audit Event.
 */
export async function removePost(db: QueryDb, actor: Actor, postId: string) {
	const row = await loadPostForWrite(db, actor, postId);
	if (!canRemovePost(actor, row)) {
		throw new AppError("Forbidden", "You can't remove this Post");
	}
	await db
		.delete(post)
		.where(and(eq(post.id, row.id), eq(post.organizationId, actor.organizationId)));
}
