import { eq } from "drizzle-orm";
import { oauthClient } from "@/db/schema";
import { clientDisplayName } from "@/domain/mcpOauth";
import { writeQuotaError } from "@/domain/mcpQuota";
import type { makeProfileChanges, Via } from "@/domain/profileChanges";
import type { QueryDb } from "@/domain/queries/db";
import { assertDailyWriteQuota } from "@/domain/queries/writeQuota";
import type { ConnectionActor } from "../actor";
import type { ToolCall } from "./define";

/** The mutation seam as seen through one Connection (`via` baked in). */
export type ProfileChangesSeam = ReturnType<typeof makeProfileChanges>;

/** Everything a write tool needs besides the Actor; injected so tests can fake the edges. */
export type WriteDeps = {
	db: QueryDb;
	/** Per-Connection seam instance: stamps `via` on the Audit Events + Change Requests it writes. */
	changesFor: (via: Via) => ProfileChangesSeam;
	/** CF Rate Limiting binding for write calls (10/min). Absent = no burst limit (tests only). */
	burst?: Pick<RateLimit, "limit">;
	now?: () => number;
	/** Test override of the daily quota numbers. */
	quotaLimits?: { daily: number; create: number };
};

/**
 * Start of every write tool body, in this order: burst limit (counts every call that reaches
 * the tool, whatever its outcome), daily quota (counted from attributed Audit Events; a create
 * also checks the create sub-cap), then the seam instance carrying this Connection's `via`.
 * Quota failures are `LimitReached` tool errors, never HTTP 429.
 */
export async function beginWrite(
	deps: WriteDeps,
	actor: ConnectionActor,
	call: ToolCall,
	{ create = false }: { create?: boolean } = {}
): Promise<{ changes: ProfileChangesSeam }> {
	if (deps.burst) {
		const { success } = await deps.burst.limit({
			key: `${call.clientId}:${actor.userId}:${actor.organizationId}`,
		});
		if (!success) throw writeQuotaError(1);
	}
	await assertDailyWriteQuota(
		deps.db,
		{ organizationId: actor.organizationId, userId: actor.userId, clientId: call.clientId },
		{ create, now: deps.now?.(), limits: deps.quotaLimits }
	);
	return { changes: deps.changesFor(await viaOf(deps.db, call.clientId)) };
}

/** Attribution snapshot: the client's registered name now (renames don't touch old rows). */
async function viaOf(db: QueryDb, clientId: string): Promise<Via> {
	const [row] = await db
		.select({ name: oauthClient.name })
		.from(oauthClient)
		.where(eq(oauthClient.clientId, clientId))
		.limit(1);
	return { clientId, clientName: clientDisplayName(row?.name) };
}
