import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

/** Real schema: replays the drizzle migrations into an in-memory sqlite behind a drizzle client. */
export function freshDb() {
	const sqlite = new DatabaseSync(":memory:");
	const dir = new URL("../../migrations/", import.meta.url);
	for (const file of readdirSync(dir)
		.filter((f) => f.endsWith(".sql"))
		.sort()) {
		for (const stmt of readFileSync(new URL(file, dir), "utf8").split("--> statement-breakpoint")) {
			if (stmt.trim()) sqlite.exec(stmt);
		}
	}
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
