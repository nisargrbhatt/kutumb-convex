import { post } from "@/db/app-schema";
import type { PostKind } from "@/db/constants";
import type { Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

/**
 * Feed helper for each kind's create function: the `post` base row as a batch statement, so the
 * kind writes its own row in the same `db.batch`. There is no generic `create` (spec § Seam).
 */
export const insertPostBase = (
	db: QueryDb,
	p: { id: string; kind: PostKind; author: Actor; authorName: string; createdAt: Date }
) =>
	db.insert(post).values({
		id: p.id,
		organizationId: p.author.organizationId,
		kind: p.kind,
		authorUserId: p.author.userId,
		authorName: p.authorName,
		createdAt: p.createdAt,
	});
