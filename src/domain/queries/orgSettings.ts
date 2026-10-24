import { eq } from "drizzle-orm";
import { orgSetting } from "@/db/schema";
import { assertCan, type Actor } from "@/domain/permission";
import type { QueryDb } from "./db";

/** Whether AI Clients may write in this community. Missing row = on (ADR 0006). */
export async function getAiClientWrites(db: QueryDb, organizationId: string): Promise<boolean> {
	const [row] = await db
		.select({ aiClientWrites: orgSetting.aiClientWrites })
		.from(orgSetting)
		.where(eq(orgSetting.organizationId, organizationId))
		.limit(1);
	return row?.aiClientWrites ?? true;
}

/** Owner-only. Takes effect on every AI Client's next call (read in the per-request Actor join). */
export async function setAiClientWrites(
	db: QueryDb,
	actor: Actor,
	enabled: boolean
): Promise<void> {
	assertCan(actor, { orgSetting: ["update"] });
	await db
		.insert(orgSetting)
		.values({ organizationId: actor.organizationId, aiClientWrites: enabled })
		.onConflictDoUpdate({ target: orgSetting.organizationId, set: { aiClientWrites: enabled } });
}
