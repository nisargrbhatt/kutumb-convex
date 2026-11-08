import { and, eq, gte, sum } from "drizzle-orm";
import { BLOB_STATUS } from "@/db/constants";
import { mediaBlob } from "@/db/app-schema";
import type { QueryDb } from "./db";

/** Bytes reserved by a member's `pending` Blobs created at or after `since` (unexpired). */
export async function memberPendingBytes(
	db: QueryDb,
	organizationId: string,
	userId: string,
	since: Date
): Promise<number> {
	const [row] = await db
		.select({ n: sum(mediaBlob.size) })
		.from(mediaBlob)
		.where(
			and(
				eq(mediaBlob.organizationId, organizationId),
				eq(mediaBlob.uploadedByUserId, userId),
				eq(mediaBlob.status, BLOB_STATUS.pending),
				gte(mediaBlob.createdAt, since)
			)
		);
	return Number(row?.n ?? 0);
}
