import { z } from "zod";
import type { PostKind } from "@/db/constants";
import { MEMORY_DESCRIPTION_MAX, MEMORY_TITLE_MAX } from "./limits";
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

export type PostBase = {
	id: string;
	author: AuthorDisplay;
	/** For the Feed policy (`src/domain/feedPolicy.ts`) on the client. */
	authorUserId: string;
	createdAt: Date;
	editedAt: Date | null;
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
