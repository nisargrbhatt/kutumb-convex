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
import {
	createMemory as createMemoryRow,
	getMemoryForEdit as getMemoryForEditRow,
	updateMemory as updateMemoryRow,
} from "@/domain/queries/memory";
import { removePost as removePostRow } from "@/domain/queries/postBase";
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

/** A Memory's source for the edit Drawer; author only. */
export const getMemoryForEdit = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.validator(postIdInput)
	.handler(({ context, data }) => getMemoryForEditRow(db, context.actor, data.postId));

/** Author edits a Memory; sets `editedAt`. */
export const updateMemory = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(postIdInput.extend(memoryInput.shape))
	.handler(({ context, data: { postId, ...input } }) =>
		updateMemoryRow({ db }, context.actor, postId, input)
	);

/** Author or owner/admin removes a Post. Hard delete, no Audit Event. */
export const removePost = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(postIdInput)
	.handler(({ context, data }) => removePostRow(db, context.actor, data.postId));
