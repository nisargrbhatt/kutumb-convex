import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

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
	const db = drizzle(
		async (sql, params, method) => {
			const stmt = sqlite.prepare(sql);
			if (method === "run") {
				stmt.run(...(params as never[]));
				return { rows: [] };
			}
			stmt.setReturnArrays(true);
			const rows = stmt.all(...(params as never[])) as unknown as unknown[][];
			// drizzle expects `undefined` (not `[]`) for a `get` that finds no row.
			return { rows: (method === "get" ? rows[0] : rows) as unknown[] };
		},
		{ schema }
	);
	return { sqlite, db };
}
