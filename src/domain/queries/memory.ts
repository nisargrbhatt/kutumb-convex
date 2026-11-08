import { eq, inArray } from "drizzle-orm";
import { post, postMemory } from "@/db/app-schema";
import { POST_KIND } from "@/db/constants";
import { AppError } from "@/domain/errors";
import type { FeedView, MemoryInput } from "@/domain/feed";
import { canEditPost } from "@/domain/feedPolicy";
import { parseDescription } from "@/domain/memoryDescription";
import type { Actor } from "@/domain/permission";
import type { BatchDb } from "@/domain/profileChanges";
import type { QueryDb } from "./db";
import { insertPostBase, loadPostForWrite } from "./postBase";

/** Memory's half of the Feed read seam: cards read `descriptionText`, detail `descriptionDoc`. */
export const memoryKind = {
	load: (db: QueryDb, postIds: string[], view: FeedView) =>
		view === "card"
			? db
					.select({
						postId: postMemory.postId,
						title: postMemory.title,
						descriptionText: postMemory.descriptionText,
					})
					.from(postMemory)
					.where(inArray(postMemory.postId, postIds))
			: db
					.select({
						postId: postMemory.postId,
						title: postMemory.title,
						descriptionDoc: postMemory.descriptionDoc,
					})
					.from(postMemory)
					.where(inArray(postMemory.postId, postIds)),
};

export type MemoryDeps = { db: BatchDb; now?: () => Date; newId?: () => string };

/**
 * Any Org Member posts a Memory; live at once. Only `title` and the description source are taken
 * from the client: `descriptionDoc` / `descriptionText` are derived here. A description that fails
 * the rules is `Invalid` with the same message Preview shows.
 */
export async function createMemory(
	{ db, now = () => new Date(), newId = () => crypto.randomUUID().replaceAll("-", "") }: MemoryDeps,
	actor: Actor,
	authorName: string,
	input: MemoryInput
) {
	const parsed = parseDescription(input.description);
	if (!parsed.ok) throw new AppError("Invalid", parsed.error);
	const postId = newId();
	await db.batch([
		insertPostBase(db, {
			id: postId,
			kind: POST_KIND.memory,
			author: actor,
			authorName,
			createdAt: now(),
		}),
		db.insert(postMemory).values({
			postId,
			title: input.title,
			description: parsed.source,
			descriptionDoc: parsed.doc,
			descriptionText: parsed.text,
		}),
	]);
	return { postId };
}

/** Edit loads the source of truth: author only. */
export async function getMemoryForEdit(db: QueryDb, actor: Actor, postId: string) {
	const row = await loadPostForWrite(db, actor, postId, POST_KIND.memory);
	if (!canEditPost(actor, row)) throw new AppError("Forbidden", "Only the author can edit");
	const [m] = await db
		.select({ title: postMemory.title, description: postMemory.description })
		.from(postMemory)
		.where(eq(postMemory.postId, row.id))
		.limit(1);
	if (!m) throw new AppError("NotFound", "Post not found");
	return { title: m.title, description: m.description ?? "" };
}

/**
 * Author edits title and description, any time while an Org Member. Re-parses the description
 * (derived fields Worker-written) and sets `editedAt`; `createdAt` stays, so the Feed order does
 * too. Last write wins.
 */
export async function updateMemory(
	{ db, now = () => new Date() }: MemoryDeps,
	actor: Actor,
	postId: string,
	input: MemoryInput
) {
	const row = await loadPostForWrite(db, actor, postId, POST_KIND.memory);
	if (!canEditPost(actor, row)) throw new AppError("Forbidden", "Only the author can edit");
	const parsed = parseDescription(input.description);
	if (!parsed.ok) throw new AppError("Invalid", parsed.error);
	await db.batch([
		db.update(post).set({ editedAt: now() }).where(eq(post.id, row.id)),
		db
			.update(postMemory)
			.set({
				title: input.title,
				description: parsed.source,
				descriptionDoc: parsed.doc,
				descriptionText: parsed.text,
			})
			.where(eq(postMemory.postId, row.id)),
	]);
	return { postId: row.id };
}
