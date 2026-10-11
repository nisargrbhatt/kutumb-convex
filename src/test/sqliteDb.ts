import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

/** D1's per-statement bound-parameter cap, enforced by `freshDb` so tests catch overflows. */
export const D1_MAX_BOUND_PARAMS = 100;

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);

/**
 * Replays migration files (sorted) into `sqlite`. `from` / `before` are filename prefixes
 * (e.g. "0007"): `from` inclusive, `before` exclusive.
 */
export function applyMigrations(
	sqlite: DatabaseSync,
	{ from, before }: { from?: string; before?: string } = {}
) {
	for (const file of readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith(".sql"))
		.filter((f) => (from === undefined || f >= from) && (before === undefined || f < before))
		.sort()) {
		for (const stmt of readFileSync(new URL(file, MIGRATIONS_DIR), "utf8").split(
			"--> statement-breakpoint"
		)) {
			if (stmt.trim()) sqlite.exec(stmt);
		}
	}
}

/**
 * Real schema: replays the drizzle migrations into an in-memory sqlite behind a drizzle client.
 * Pass `before` to stop short of a migration (seed old-shape rows, then `applyMigrations({ from })`).
 */
export function freshDb({ before }: { before?: string } = {}) {
	const sqlite = new DatabaseSync(":memory:");
	applyMigrations(sqlite, { before });
	type Method = "run" | "all" | "values" | "get";
	const exec = (sql: string, params: unknown[], method: Method) => {
		// D1 rejects statements with more than 100 bound parameters; local sqlite doesn't.
		if (params.length > D1_MAX_BOUND_PARAMS)
			throw new Error(`too many SQL variables: ${params.length} > ${D1_MAX_BOUND_PARAMS}`);
		const stmt = sqlite.prepare(sql);
		if (method === "run") {
			stmt.run(...(params as never[]));
			return { rows: [] };
		}
		stmt.setReturnArrays(true);
		const rows = stmt.all(...(params as never[])) as unknown as unknown[][];
		// drizzle expects `undefined` (not `[]`) for a `get` that finds no row.
		return { rows: (method === "get" ? rows[0] : rows) as unknown[] };
	};
	const db = drizzle(
		async (sql, params, method) => exec(sql, params, method),
		// `db.batch`: all-or-nothing like D1 (one implicit transaction).
		async (queries) => {
			sqlite.exec("BEGIN");
			try {
				const results = queries.map((q) => exec(q.sql, q.params, q.method));
				sqlite.exec("COMMIT");
				return results;
			} catch (e) {
				sqlite.exec("ROLLBACK");
				throw e;
			}
		},
		{ schema }
	);
	return { sqlite, db };
}
