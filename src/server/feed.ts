import { createServerFn } from "@tanstack/react-start";
import { db } from "@/db";
import { feedPageInput, memoryInput, postIdInput } from "@/domain/feed";
import { getPost, listFeed } from "@/domain/queries/feed";
import { createMemory as createMemoryRow } from "@/domain/queries/memory";
import { locatePost } from "@/domain/queries/postLocation";
import { authMiddleware } from "@/middleware/auth";
import { orgMiddleware } from "@/middleware/org";

/** One Feed page of the active org, newest first. */
export const getFeedPage = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(feedPageInput)
	.handler(({ context, data }) => listFeed(db, context.actor, data));

/** One Post for its detail page, active org only. On `NotFound` the page asks `locateFeedPost`. */
export const getFeedPost = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(postIdInput)
	.handler(({ context, data }) => getPost(db, context.actor, data.postId));

/**
 * Share link: where does this Post live for the viewer? `authMiddleware`, not `orgMiddleware`: skips
 * active-org scoping and checks membership itself. Read-only (loaders run on hover).
 */
export const locateFeedPost = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(postIdInput)
	.handler(({ context, data }) =>
		locatePost(
			db,
			{
				userId: context.userId,
				activeOrganizationId: context.session.session.activeOrganizationId,
			},
			data.postId
		)
	);

/** Any Org Member posts a Memory. Author name is the `user.name` snapshot. */
export const createMemory = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(memoryInput)
	.handler(({ context, data }) =>
		createMemoryRow({ db }, context.actor, context.session.user.name, data)
	);
