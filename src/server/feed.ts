import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import {
	feedPageInput,
	likersPageInput,
	memoryInput,
	postIdInput,
	setLikeInput,
} from "@/domain/feed";
import { getPost, listFeed } from "@/domain/queries/feed";
import { listLikers, setLike as setLikeRow } from "@/domain/queries/likes";
import { createMemory as createMemoryRow } from "@/domain/queries/memory";
import { orgMiddleware } from "@/middleware/org";

/** One Feed page of the active org, newest first. */
export const getFeedPage = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(feedPageInput)
	.handler(({ context, data }) => listFeed(db, context.actor, data));

/** One Post for its detail page, active org only (Share link slice replaces this read). */
export const getFeedPost = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(postIdInput)
	.handler(({ context, data }) => getPost(db, context.actor, data.postId));

/** Any Org Member posts a Memory. Author name is the `user.name` snapshot. */
export const createMemory = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(memoryInput)
	.handler(({ context, data }) =>
		createMemoryRow({ db }, context.actor, context.session.user.name, data)
	);

/** Desired-state like (`liked: true|false`), idempotent. Name is the `user.name` snapshot. */
export const setLike = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(setLikeInput)
	.handler(({ context, data }) =>
		setLikeRow({ db }, context.actor, context.session.user.name, data)
	);

/** Who liked a Post, fetched only when its count is tapped. */
export const getPostLikers = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(likersPageInput)
	.handler(({ context, data }) => listLikers(db, context.actor, data));
