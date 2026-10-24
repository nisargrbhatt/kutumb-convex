import { and, asc, count, eq, gt, or, sql } from "drizzle-orm";
import { auditEvent } from "@/db/app-schema";
import {
	CREATE_DAILY_LIMIT,
	QUOTA_WINDOW_MS,
	WRITE_DAILY_LIMIT,
	minutesUntil,
	writeQuotaError,
} from "@/domain/mcpQuota";
import type { QueryDb } from "./db";

export type ConnectionWriteKey = { organizationId: string; userId: string; clientId: string };

/**
 * Daily write quota of one Connection, counted from its attributed Audit Events (ADR 0007): only
 * `applied` / `requested` outcomes write events, so unchanged / duplicate / errors are free. A
 * soft cap (count, then the caller writes): a racing burst can overshoot by a few.
 *
 * Over the pool (or, for a create, the create sub-cap) → `LimitReached` "resets in ~N min", where
 * N is when enough old events leave the rolling window to free a slot (the later of the two caps
 * when both are hit).
 */
export async function assertDailyWriteQuota(
	db: QueryDb,
	key: ConnectionWriteKey,
	{
		create,
		now = Date.now(),
		limits = { daily: WRITE_DAILY_LIMIT, create: CREATE_DAILY_LIMIT },
	}: { create: boolean; now?: number; limits?: { daily: number; create: number } }
) {
	const mine = and(
		eq(auditEvent.organizationId, key.organizationId),
		eq(auditEvent.actorUserId, key.userId),
		eq(auditEvent.viaClientId, key.clientId),
		gt(auditEvent.createdAt, new Date(now - QUOTA_WINDOW_MS))
	);
	// A create is an applied `profile.created` or a member's pending create request.
	const isCreate = or(
		eq(auditEvent.action, "profile.created"),
		and(
			eq(auditEvent.action, "change_request.submitted"),
			sql`json_extract(${auditEvent.payload}, '$.kind') = 'create'`
		)
	);

	/** Ms epoch at which `scope` drops back under `limit`; null when it is under already. */
	async function resetsAt(scope: ReturnType<typeof and>, limit: number) {
		const [row] = await db.select({ n: count() }).from(auditEvent).where(scope);
		const used = row?.n ?? 0;
		if (used < limit) return null;
		// The (used - limit + 1)th oldest event leaving the window frees the slot.
		const [edge] = await db
			.select({ at: auditEvent.createdAt })
			.from(auditEvent)
			.where(scope)
			.orderBy(asc(auditEvent.createdAt))
			.limit(1)
			.offset(used - limit);
		return (edge?.at.getTime() ?? now) + QUOTA_WINDOW_MS;
	}

	const [pool, creates] = await Promise.all([
		resetsAt(mine, limits.daily),
		create ? resetsAt(and(mine, isCreate), limits.create) : null,
	]);
	const reset = Math.max(pool ?? 0, creates ?? 0);
	if (reset > 0) throw writeQuotaError(minutesUntil(reset, now));
}
