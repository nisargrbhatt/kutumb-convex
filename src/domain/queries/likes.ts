import { and, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { post, postLike } from "@/db/app-schema";
import { AppError } from "@/domain/errors";
import {
	LIKERS_PAGE_SIZE,
	decodeFeedCursor,
	encodeFeedCursor,
	type LikersPage,
	type SetLikeInput,
} from "@/domain/feed";
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

/** Feed batch item: `{ postId, count }` per Post with any like (`COUNT … GROUP BY`). */
export const likeCountsQuery = (db: QueryDb, postIds: readonly string[]) =>
	db
		.select({ postId: postLike.postId, count: count() })
		.from(postLike)
		.where(inArray(postLike.postId, [...postIds]))
		.groupBy(postLike.postId);

/** Feed batch item: the Posts among `postIds` the viewer liked. */
export const viewerLikesQuery = (db: QueryDb, viewer: Actor, postIds: readonly string[]) =>
	db
		.select({ postId: postLike.postId })
		.from(postLike)
		.where(and(inArray(postLike.postId, [...postIds]), eq(postLike.userId, viewer.userId)));

export type LikeDeps = { db: BatchDb; now?: () => Date; newId?: () => string };

/**
 * Sets the viewer's like to the desired state. Idempotent: `liked: true` on a liked Post and
 * `liked: false` on an unliked one are no-ops. `userName` is the frozen `user.name` snapshot. The
 * write and the Post check share one batch, so a Post removed mid-action is `NotFound`.
 */
export async function setLike(
	{ db, now = () => new Date(), newId = () => crypto.randomUUID().replaceAll("-", "") }: LikeDeps,
	actor: Actor,
	userName: string,
	{ postId, liked }: SetLikeInput
) {
	const write = liked
		? db
				.insert(postLike)
				.select(
					db
						.select({
							id: sql<string>`${newId()}`.as("id"),
							postId: post.id,
							userId: sql<string>`${actor.userId}`.as("userId"),
							userName: sql<string>`${userName}`.as("userName"),
							createdAt: sql<number>`${now().getTime()}`.as("createdAt"),
						})
						.from(post)
						.where(and(eq(post.id, postId), eq(post.organizationId, actor.organizationId)))
				)
				.onConflictDoNothing()
		: db
				.delete(postLike)
				.where(
					and(
						inArray(postLike.postId, postInOrg(db, actor, postId)),
						eq(postLike.userId, actor.userId)
					)
				);
	const [, found] = await db.batch([write, postInOrg(db, actor, postId)]);
	if (found.length === 0) throw new AppError("NotFound", REMOVED);
}

/** Who liked a Post: newest first, 50 per page, by the author display rule. */
export async function listLikers(
	db: BatchDb,
	viewer: Actor,
	{ postId, cursor }: { postId: string; cursor?: string }
): Promise<LikersPage> {
	const after = cursor ? decodeFeedCursor(cursor) : null;
	if (cursor && !after) throw new AppError("Invalid", "Bad cursor");
	const [found, page] = await db.batch([
		postInOrg(db, viewer, postId),
		db
			.select({
				id: postLike.id,
				userId: postLike.userId,
				userName: postLike.userName,
				createdAt: postLike.createdAt,
			})
			.from(postLike)
			.where(
				and(
					inArray(postLike.postId, postInOrg(db, viewer, postId)),
					after
						? or(
								lt(postLike.createdAt, after.createdAt),
								and(eq(postLike.createdAt, after.createdAt), lt(postLike.id, after.id))
							)
						: undefined
				)
			)
			.orderBy(desc(postLike.createdAt), desc(postLike.id))
			.limit(LIKERS_PAGE_SIZE + 1),
	]);
	if (found.length === 0) throw new AppError("NotFound", REMOVED);

	const rows = page.slice(0, LIKERS_PAGE_SIZE);
	const last = rows.at(-1);
	const author = authorDisplay(
		rows.length
			? await authorProfilesQuery(db, viewer, [...new Set(rows.map((r) => r.userId))])
			: []
	);
	return {
		likers: rows.map((r) => ({
			id: r.id,
			author: author(r.userId, r.userName),
			createdAt: r.createdAt,
		})),
		nextCursor:
			page.length > LIKERS_PAGE_SIZE && last ? encodeFeedCursor(last.createdAt, last.id) : null,
	};
}
