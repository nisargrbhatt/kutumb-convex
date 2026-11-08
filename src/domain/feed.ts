import { z } from "zod";
import type { PostKind } from "@/db/constants";
import { COMMENT_MAX, MEMORY_DESCRIPTION_MAX, MEMORY_TITLE_MAX } from "./limits";
import type { DescriptionDoc } from "./memoryDescription";

/**
 * Feed types shared by server and client (pure, client-safe). Server seam: `POST_KINDS` in
 * `src/domain/queries/feed.ts`; client seam: `POST_KIND_VIEWS` in `src/components/feed/kinds.tsx`.
 */

export const FEED_PAGE_SIZE = 10;

/** What a kind's `load` reads: cards never select the tree or the source. */
export type FeedView = "card" | "detail";

/**
 * Who posted, likes or comments, as the viewer may see them: the Community Profile when
 * `visibleProfileWhere(viewer)` finds it (`profileId` set: link it), else the frozen snapshot name
 * and its initials, no photo, no link.
 */
export type AuthorDisplay = { name: string; initials: string; profileId: string | null };

/** Per kind, what each view carries. Adding a `PostKind` without an entry fails to compile. */
export type PostKindData = {
	memory: {
		card: { title: string; descriptionText: string | null };
		detail: { title: string; descriptionDoc: DescriptionDoc | null };
	};
};
// Compile-time check: every kind has both views, and nothing else.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _everyKind: Exact<keyof PostKindData, PostKind> = true;
void _everyKind;

/** Like count (`COUNT … GROUP BY` at read, no counter column) and whether the viewer liked. */
export type PostLikes = { count: number; viewerLiked: boolean };

/** Optimistic like state: the viewer's desired state, the count moved only on a real change. */
export function withLike(likes: PostLikes, liked: boolean): PostLikes {
	if (likes.viewerLiked === liked) return likes;
	return { count: Math.max(0, likes.count + (liked ? 1 : -1)), viewerLiked: liked };
}

export type PostBase = {
	id: string;
	author: AuthorDisplay;
	/** For the Feed policy (`src/domain/feedPolicy.ts`) on the client. */
	authorUserId: string;
	createdAt: Date;
	editedAt: Date | null;
	likes: PostLikes;
	/** `COUNT … GROUP BY` at read; cards show the count only. */
	commentCount: number;
};

/** One Post as read for `V`, discriminated by `kind`. */
export type FeedPost<V extends FeedView, K extends PostKind = PostKind> = K extends PostKind
	? PostBase & { kind: K; data: PostKindData[K][V] }
	: never;

export type FeedPage = { posts: FeedPost<"card">[]; nextCursor: string | null };

/** Opaque `createdAt:id` cursor (same shape as the audit log's). */
export const encodeFeedCursor = (createdAt: Date, id: string) => `${createdAt.getTime()}:${id}`;
export function decodeFeedCursor(cursor: string) {
	const i = cursor.indexOf(":");
	const at = Number(cursor.slice(0, i));
	if (i < 1 || !Number.isSafeInteger(at)) return null;
	return { createdAt: new Date(at), id: cursor.slice(i + 1) };
}

export const feedPageInput = z.object({ cursor: z.string().max(200).optional() });
export const postIdInput = z.object({ postId: z.string().trim().min(1).max(64) });

/**
 * Memory create input. Only the source travels: `descriptionDoc` / `descriptionText` are derived
 * by the Worker, and unknown keys are stripped.
 */
export const memoryInput = z.object({
	title: z
		.string()
		.trim()
		.min(1, "Title is required")
		.max(MEMORY_TITLE_MAX, `Title can be at most ${MEMORY_TITLE_MAX} characters`),
	description: z.string().max(MEMORY_DESCRIPTION_MAX).default(""),
});
export type MemoryInput = z.infer<typeof memoryInput>;

/** Initials of a snapshot name: first letter of the first and last word, `?` when blank. */
export function nameInitials(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	const first = Array.from(words[0] ?? "")[0] ?? "";
	const last = words.length > 1 ? (Array.from(words.at(-1)!)[0] ?? "") : "";
	return (first + last).toUpperCase() || "?";
}

/** Who liked: newest first, 50 per page, same `createdAt:id` cursor. */
export const LIKERS_PAGE_SIZE = 50;

/** Desired state, not a flip: sending the same state twice is a no-op. */
export const setLikeInput = postIdInput.extend({ liked: z.boolean() });
export type SetLikeInput = z.infer<typeof setLikeInput>;

export const likersPageInput = postIdInput.extend({ cursor: z.string().max(200).optional() });

export type Liker = { id: string; author: AuthorDisplay; createdAt: Date };
export type LikersPage = { likers: Liker[]; nextCursor: string | null };

/** Comments: newest first, 20 per page, same `createdAt:id` cursor. */
export const COMMENTS_PAGE_SIZE = 20;

/** Plain text, line breaks kept; trimmed, not empty. */
export const commentBody = z
	.string()
	.trim()
	.min(1, "Comment can't be empty")
	.max(COMMENT_MAX, `Comment can be at most ${COMMENT_MAX} characters`);

export const createCommentInput = postIdInput.extend({ body: commentBody });
export type CreateCommentInput = z.infer<typeof createCommentInput>;

export const commentsPageInput = postIdInput.extend({ cursor: z.string().max(200).optional() });

export const commentIdInput = z.object({ commentId: z.string().trim().min(1).max(64) });

export type PostComment = {
	id: string;
	author: AuthorDisplay;
	/** For the Feed policy (`canRemoveComment`) on the client. */
	authorUserId: string;
	body: string;
	createdAt: Date;
};
export type CommentsPage = { comments: PostComment[]; nextCursor: string | null };
