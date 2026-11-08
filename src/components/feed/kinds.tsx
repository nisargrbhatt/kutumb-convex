import type { ComponentType } from "react";
import type { PostKind } from "@/db/constants";
import type { FeedPost } from "@/domain/feed";
import { MemoryCard, MemoryDetail } from "./memory";

/**
 * Client half of the Feed seam: per kind, its Card and Detail. Kept apart from the server's
 * `POST_KINDS` so server code never imports React. A new `PostKind` fails to compile until it has
 * an entry.
 */
export const POST_KIND_VIEWS: {
	[K in PostKind]: {
		Card: ComponentType<{ post: FeedPost<"card", K> }>;
		Detail: ComponentType<{ post: FeedPost<"detail", K> }>;
	};
} = {
	memory: { Card: MemoryCard, Detail: MemoryDetail },
};

const viewsOf = (kind: string) =>
	Object.hasOwn(POST_KIND_VIEWS, kind) ? POST_KIND_VIEWS[kind as PostKind] : undefined;

/** A stale client skips a card of a kind it doesn't know. */
export function PostCard({ post }: { post: FeedPost<"card"> }) {
	const views = viewsOf(post.kind);
	if (!views) return null;
	const Card = views.Card as ComponentType<{ post: FeedPost<"card"> }>;
	return <Card post={post} />;
}

export function PostDetail({ post }: { post: FeedPost<"detail"> }) {
	const views = viewsOf(post.kind);
	if (!views) return null;
	const Detail = views.Detail as ComponentType<{ post: FeedPost<"detail"> }>;
	return <Detail post={post} />;
}
