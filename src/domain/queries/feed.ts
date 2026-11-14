import type { BatchItem } from "drizzle-orm/batch";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { post } from "@/db/app-schema";
import type { PostKind } from "@/db/constants";
import { AppError } from "@/domain/errors";
import {
	FEED_PAGE_SIZE,
	decodeFeedCursor,
	encodeFeedCursor,
	type FeedPage,
	type FeedPost,
	type FeedView,
	type PostKindData,
} from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import type { BatchDb } from "@/domain/profileChanges";
import { authorDisplay, authorProfilesQuery, type AuthorProfileRow } from "./authors";
import type { QueryDb } from "./db";
import { commentCountsQuery } from "./comments";
import { likeCountsQuery, viewerLikesQuery } from "./likes";
import { memoryKind } from "./memory";

/**
 * One kind's read half of the Feed seam (ADR 0010). `load` returns a query (not a promise) so the
 * Feed runs every kind in one `db.batch`; each row is `{ postId, ...PostKindData[K][view] }`.
 * Cards must never select the tree or the source.
 */
export type PostKindServer = {
	load(db: QueryDb, postIds: string[], view: FeedView): BatchItem<"sqlite">;
};

/** Server seam. A new `PostKind` fails to compile until it has an entry. */
export const POST_KINDS: Record<PostKind, PostKindServer> = {
	memory: memoryKind,
};

type BaseRow = Pick<
	typeof post.$inferSelect,
	"id" | "kind" | "authorUserId" | "authorName" | "createdAt" | "editedAt"
>;

const baseColumns = {
	id: post.id,
	kind: post.kind,
	authorUserId: post.authorUserId,
	authorName: post.authorName,
	createdAt: post.createdAt,
	editedAt: post.editedAt,
};

/**
 * Step two of a Feed read: one `db.batch` for authors plus each present kind's `load`. Like counts,
 * the viewer's liked state and comment counts ride it too (kind loads stay the tail). Rows whose kind data is missing are dropped.
 */
async function hydrate<V extends FeedView>(
	db: BatchDb,
	viewer: Actor,
	rows: BaseRow[],
	view: V
): Promise<FeedPost<V>[]> {
	if (rows.length === 0) return [];
	const kinds = [...new Set(rows.map((r) => r.kind))];
	const userIds = [...new Set(rows.map((r) => r.authorUserId))];
	const postIds = rows.map((r) => r.id);
	const [authorRows, countRows, likedRows, commentCountRows, ...kindRows] = (await db.batch([
		authorProfilesQuery(db, viewer, userIds),
		likeCountsQuery(db, postIds),
		viewerLikesQuery(db, viewer, postIds),
		commentCountsQuery(db, postIds),
		...kinds.map((k) =>
			POST_KINDS[k].load(
				db,
				rows.filter((r) => r.kind === k).map((r) => r.id),
				view
			)
		),
	])) as [
		AuthorProfileRow[],
		{ postId: string; count: number }[],
		{ postId: string }[],
		{ postId: string; count: number }[],
		...{ postId: string }[][],
	];

	const author = authorDisplay(authorRows);
	const data = new Map<string, unknown>();
	for (const list of kindRows) for (const { postId, ...rest } of list) data.set(postId, rest);
	const counts = new Map(countRows.map((r) => [r.postId, r.count]));
	const liked = new Set(likedRows.map((r) => r.postId));
	const comments = new Map(commentCountRows.map((r) => [r.postId, r.count]));

	return rows.flatMap((r) => {
		if (!data.has(r.id)) return [];
		const p = {
			id: r.id,
			kind: r.kind,
			author: author(r.authorUserId, r.authorName),
			authorUserId: r.authorUserId,
			createdAt: r.createdAt,
			editedAt: r.editedAt ?? null,
			likes: { count: counts.get(r.id) ?? 0, viewerLiked: liked.has(r.id) },
			commentCount: comments.get(r.id) ?? 0,
			data: data.get(r.id) as PostKindData[PostKind][V],
		};
		return [p as FeedPost<V>];
	});
}

/** Feed page, newest first: 10 per page, fetch 11, opaque `createdAt:id` cursor. Active org only. */
export async function listFeed(
	db: BatchDb,
	viewer: Actor,
	{ cursor }: { cursor?: string }
): Promise<FeedPage> {
	const after = cursor ? decodeFeedCursor(cursor) : null;
	if (cursor && !after) throw new AppError("Invalid", "Bad cursor");
	const page = await db
		.select(baseColumns)
		.from(post)
		.where(
			and(
				eq(post.organizationId, viewer.organizationId),
				after
					? or(
							lt(post.createdAt, after.createdAt),
							and(eq(post.createdAt, after.createdAt), lt(post.id, after.id))
						)
					: undefined
			)
		)
		.orderBy(desc(post.createdAt), desc(post.id))
		.limit(FEED_PAGE_SIZE + 1);

	const rows = page.slice(0, FEED_PAGE_SIZE);
	const last = rows.at(-1);
	return {
		posts: await hydrate(db, viewer, rows, "card"),
		nextCursor:
			page.length > FEED_PAGE_SIZE && last ? encodeFeedCursor(last.createdAt, last.id) : null,
	};
}

/**
 * One Post for `/feed/$postId`, scoped to the viewer's active org: another org's Post reads as
 * `NotFound`. (The Share link slice replaces this with the cross-org read.)
 */
export async function getPost(db: BatchDb, viewer: Actor, postId: string) {
	const [row] = await db
		.select(baseColumns)
		.from(post)
		.where(and(eq(post.id, postId), eq(post.organizationId, viewer.organizationId)))
		.limit(1);
	const [p] = row ? await hydrate(db, viewer, [row], "detail") : [];
	if (!p) throw new AppError("NotFound", "Post not found");
	return p;
}
