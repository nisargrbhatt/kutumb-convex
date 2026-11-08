import { sql } from "drizzle-orm";
import type { QueryDb } from "./db";

/**
 * In-batch guard: errors the `db.batch` (rolling it back) unless the previous DML touched exactly
 * `n` rows. Param-less on purpose: raw `sql` with params inside `db.batch` breaks drizzle on D1.
 * Same trick as `makeProfileChanges`' guard.
 */
export const batchGuard = (db: QueryDb, n: number) => {
	if (!Number.isInteger(n) || n < 0) throw new Error(`bad guard count ${n}`);
	return db.all(sql.raw(`SELECT CASE WHEN changes() = ${n} THEN 1 ELSE json('stale') END`));
};

/** True when `e` is a `batchGuard` firing (node:sqlite or D1 wording). */
export const isBatchGuardTrip = (e: unknown) =>
	`${String(e)} ${String((e as { cause?: unknown } | null)?.cause ?? "")}`.includes(
		"malformed JSON"
	);
