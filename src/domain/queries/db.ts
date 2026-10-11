import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "@/db/schema";

/**
 * Schema-typed async drizzle client. Structural, so both the D1 client and the in-memory sqlite
 * stand-in used in tests satisfy it — keeps query fns free of `cloudflare:workers`.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type QueryDb = BaseSQLiteDatabase<"async", any, typeof schema>;

/**
 * Ids per `IN (...)` list. D1 caps a statement at 100 bound parameters; this leaves headroom for
 * the query's other params (org id, status, …).
 */
export const IN_LIST_CHUNK = 80;

/** Runs `query` over `ids` in `IN_LIST_CHUNK`-sized slices (in parallel), concatenating rows. */
export async function inChunks<T>(
	ids: readonly string[],
	query: (chunk: string[]) => Promise<T[]>
): Promise<T[]> {
	const slices: string[][] = [];
	for (let i = 0; i < ids.length; i += IN_LIST_CHUNK) slices.push(ids.slice(i, i + IN_LIST_CHUNK));
	return (await Promise.all(slices.map(query))).flat();
}
