import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { post, postComment } from "@/db/app-schema";
import { AppError } from "@/domain/errors";
import { generatePrimaryKey } from "@/lib/generate";
import {
	COMMENTS_PAGE_SIZE,
	decodeFeedCursor,
	encodeFeedCursor,
	type CommentsPage,
	type CreateCommentInput,
} from "@/domain/feed";
import { canRemoveComment } from "@/domain/feedPolicy";
import type { Actor } from "@/domain/permission";
import type { BatchDb } from "@/domain/profileChanges";
import { authorDisplay, authorProfilesQuery } from "./authors";
import type { QueryDb } from "./db";

const REMOVED = "This Post was removed";

/** The Post, if it is in the viewer's active org. */
const postInOrg = (db: QueryDb, viewer: Actor, postId: string) =>
	db
		.select({ id: post.id })
		.from(post)
		.where(and(eq(post.id, postId), eq(post.organizationId, viewer.organizationId)));

/** Feed batch item: `{ postId, count }` per Post with any comment (`COUNT … GROUP BY`). */
export const commentCountsQuery = (db: QueryDb, postIds: readonly string[]) =>
	db
		.select({ postId: postComment.postId, count: count() })
		.from(postComment)
		.where(inArray(postComment.postId, [...postIds]))
		.groupBy(postComment.postId);

export type CommentDeps = { db: BatchDb; now?: () => Date; newId?: () => string };

/**
 * Any Org Member comments. `authorName` is the frozen `user.name` snapshot. Insert…select from the
 * org-scoped Post, batched with the Post check, so a Post removed mid-action is `NotFound`.
 */
export async function createComment(
	{ db, now = () => new Date(), newId = generatePrimaryKey }: CommentDeps,
	actor: Actor,
	authorName: string,
	{ postId, body }: CreateCommentInput
) {
	const id = newId();
	const [, found] = await db.batch([
		db.insert(postComment).select(
			db
				.select({
					id: sql<string>`${id}`.as("id"),
					postId: post.id,
					authorUserId: sql<string>`${actor.userId}`.as("authorUserId"),
					authorName: sql<string>`${authorName}`.as("authorName"),
					body: sql<string>`${body}`.as("body"),
					createdAt: sql<number>`${now().getTime()}`.as("createdAt"),
				})
				.from(post)
				.where(and(eq(post.id, postId), eq(post.organizationId, actor.organizationId)))
		),
		postInOrg(db, actor, postId),
	]);
	if (found.length === 0) throw new AppError("NotFound", REMOVED);
	return { commentId: id };
}

/** A Post's comments: newest first, 20 per page, by the author display rule. */
export async function listComments(
	db: BatchDb,
	viewer: Actor,
	{ postId, cursor }: { postId: string; cursor?: string }
): Promise<CommentsPage> {
	const after = cursor ? decodeFeedCursor(cursor) : null;
	if (cursor && !after) throw new AppError("Invalid", "Bad cursor");
	const [found, page] = await db.batch([
		postInOrg(db, viewer, postId),
		db
			.select({
				id: postComment.id,
				authorUserId: postComment.authorUserId,
				authorName: postComment.authorName,
				body: postComment.body,
				createdAt: postComment.createdAt,
			})
			.from(postComment)
			.where(
				and(
					inArray(postComment.postId, postInOrg(db, viewer, postId)),
					after
						? or(
								lt(postComment.createdAt, after.createdAt),
								and(eq(postComment.createdAt, after.createdAt), lt(postComment.id, after.id))
							)
						: undefined
				)
			)
			.orderBy(desc(postComment.createdAt), desc(postComment.id))
			.limit(COMMENTS_PAGE_SIZE + 1),
	]);
	if (found.length === 0) throw new AppError("NotFound", REMOVED);

	const rows = page.slice(0, COMMENTS_PAGE_SIZE);
	const last = rows.at(-1);
	const author = authorDisplay(
		rows.length
			? await authorProfilesQuery(db, viewer, [...new Set(rows.map((r) => r.authorUserId))])
			: []
	);
	return {
		comments: rows.map((r) => ({
			id: r.id,
			author: author(r.authorUserId, r.authorName),
			authorUserId: r.authorUserId,
			body: r.body,
			createdAt: r.createdAt,
		})),
		nextCursor:
			page.length > COMMENTS_PAGE_SIZE && last ? encodeFeedCursor(last.createdAt, last.id) : null,
	};
}

/**
 * Comment author or owner/admin; the Post author gets no extra right. Hard delete, no Audit Event.
 * Loaded by id + active org first; an already-removed (or unknown, or another org's) comment is a
 * no-op success.
 */
export async function removeComment(
	db: QueryDb,
	actor: Actor,
	{ commentId }: { commentId: string }
) {
	const inOrg = and(
		eq(postComment.id, commentId),
		inArray(
			postComment.postId,
			db.select({ id: post.id }).from(post).where(eq(post.organizationId, actor.organizationId))
		)
	);
	const [row] = await db
		.select({ authorUserId: postComment.authorUserId })
		.from(postComment)
		.where(inOrg)
		.limit(1);
	if (!row) return;
	if (!canRemoveComment(actor, row)) {
		throw new AppError("Forbidden", "You can't remove this comment");
	}
	await db.delete(postComment).where(inOrg);
}
