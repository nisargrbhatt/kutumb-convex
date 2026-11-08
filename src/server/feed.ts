import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import { feedPageInput, memoryInput, postIdInput } from "@/domain/feed";
import { getPost, listFeed } from "@/domain/queries/feed";
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
