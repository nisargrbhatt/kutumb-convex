// Throwaway (ticket 08): proves in-batch guard techniques on remote D1 via Drizzle db.batch.
// Run: cd here; npx wrangler deploy; curl <url>/guards | /changes | /limit?n=&mode=batch|serial
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { integer, sqliteTable } from "drizzle-orm/sqlite-core";

const t = sqliteTable("t", {
	id: integer().primaryKey(),
	v: integer().notNull(),
	version: integer().notNull(),
});

type Env = { DB: D1Database };

const setup = [
	"DROP TABLE IF EXISTS t",
	"DROP TABLE IF EXISTS audit",
	"DROP TABLE IF EXISTS guard",
	"DROP TABLE IF EXISTS guard_trg",
	"CREATE TABLE t (id INTEGER PRIMARY KEY, v INTEGER NOT NULL, version INTEGER NOT NULL)",
	"CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, note TEXT NOT NULL)",
	"CREATE TABLE guard (ok INTEGER NOT NULL CHECK (ok = 1))",
	"CREATE TABLE guard_trg (n INTEGER NOT NULL)",
	"CREATE TRIGGER guard_trg_abort BEFORE INSERT ON guard_trg WHEN NEW.n <> 1 BEGIN SELECT RAISE(ABORT, 'stale'); END",
	"INSERT INTO t (id, v, version) VALUES (1, 0, 1), (2, 0, 1), (3, 0, 1)",
];

const guards = {
	a: () => sql`SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('stale') END`,
	b: () => sql`INSERT INTO guard (ok) VALUES (changes())`,
	d: () => sql`INSERT INTO guard_trg (n) VALUES (changes())`,
} as const;

const errText = (e: unknown) => {
	const err = e as Error & { cause?: unknown };
	return `${String(err)}${err.cause ? ` | cause: ${String(err.cause)}` : ""}`;
};

async function reset(env: Env) {
	await env.DB.batch(setup.map((s) => env.DB.prepare(s)));
}

async function state(env: Env) {
	const row = await env.DB.prepare("SELECT v, version FROM t WHERE id = 1").first();
	const audit = await env.DB.prepare("SELECT group_concat(note) AS notes FROM audit").first();
	return { row, audit };
}

async function guardCase(env: Env, technique: keyof typeof guards, expectedVersion: number) {
	await reset(env);
	const db = drizzle(env.DB);
	let error: string | null = null;
	try {
		await db.batch([
			db.run(sql`INSERT INTO audit (note) VALUES ('pre')`),
			// NB: raw db.run(sql`...${param}`) inside db.batch throws "reading 'bind'" (drizzle 0.45.2);
			// builders (as app code uses) are fine.
			db
				.update(t)
				.set({ v: sql`${t.v} + 1`, version: sql`${t.version} + 1` })
				.where(and(eq(t.id, 1), eq(t.version, expectedVersion))),
			technique === "a" ? db.all(guards.a()) : db.run(guards[technique]()),
			db.run(sql`INSERT INTO audit (note) VALUES ('post')`),
		]);
	} catch (e) {
		error = errText(e);
	}
	return { technique, expectedVersion, error, after: await state(env) };
}

async function changesCase(env: Env) {
	await reset(env);
	const db = drizzle(env.DB);
	const r = await db.batch([
		db.run(sql`UPDATE t SET v = v + 1`), // 3 rows
		db.all(sql`SELECT changes() AS c`),
		db.run(sql`UPDATE t SET v = v + 1 WHERE id = 999`), // 0 rows
		db.all(sql`SELECT changes() AS c`),
		db.run(sql`UPDATE t SET v = v + 1 WHERE id IN (1, 2)`), // 2 rows
		db.all(sql`SELECT 1 AS one`),
		db.all(sql`SELECT changes() AS c`), // after an intervening SELECT
		db.run(sql`INSERT INTO audit (note) VALUES ('x')`), // 1 row
		db.all(sql`SELECT changes() AS c`),
	]);
	return { after3: r[1], after0: r[3], after2ThenSelect: r[6], afterInsert1: r[8] };
}

async function limitCase(env: Env, n: number, mode: "batch" | "serial") {
	let error: string | null = null;
	let ran = 0;
	try {
		if (mode === "batch") {
			const res = await env.DB.batch(Array.from({ length: n }, () => env.DB.prepare("SELECT 1")));
			ran = res.length;
		} else {
			for (let i = 0; i < n; i++) {
				await env.DB.prepare("SELECT 1").first();
				ran++;
			}
		}
	} catch (e) {
		error = errText(e);
	}
	return { mode, n, ran, error };
}

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const p = url.pathname;
		if (p === "/guards") {
			const out = [];
			for (const t of ["a", "b", "d"] as const) {
				out.push(await guardCase(env, t, 99)); // stale: 0 rows
				out.push(await guardCase(env, t, 1)); // fresh: 1 row
			}
			return Response.json(out);
		}
		if (p === "/changes") return Response.json(await changesCase(env));
		if (p === "/limit") {
			const n = Number(url.searchParams.get("n") ?? "10");
			const mode = (url.searchParams.get("mode") ?? "batch") as "batch" | "serial";
			return Response.json(await limitCase(env, n, mode));
		}
		return Response.json({ routes: ["/guards", "/changes", "/limit?n=&mode=batch|serial"] });
	},
};
