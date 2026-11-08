import { inArray } from "drizzle-orm";
import { postMemory } from "@/db/app-schema";
import { POST_KIND } from "@/db/constants";
import { AppError } from "@/domain/errors";
import type { FeedView, MemoryInput } from "@/domain/feed";
import { parseDescription } from "@/domain/memoryDescription";
import type { Actor } from "@/domain/permission";
import type { BatchDb } from "@/domain/profileChanges";
import type { QueryDb } from "./db";
import { insertPostBase } from "./postBase";

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
