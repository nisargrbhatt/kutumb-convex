# Research: D1 batch atomicity via Drizzle

Ticket: `.scratch/profile-lifecycle/issues/01-d1-batch-atomicity.md`
Date: 2026-10-10. Versions: `drizzle-orm` 0.45.2, `wrangler` 4.98.0, `miniflare` 4.20260603.0.

Evidence types: **[doc]** Cloudflare/Drizzle docs, **[src]** source code, **[local]** run against
local D1 (miniflare via `getPlatformProxy`). Local = same SQLite/workerd stack, but **not** prod D1;
items marked [local]-only should get one smoke test against remote before relying on them.

## TL;DR

- `db.batch([...])` = one D1 `batch()` call = one SQL transaction. Any statement error → whole batch
  rolled back. [doc][src][local]
- A statement that _succeeds_ but touches 0 rows does **not** abort the batch. You must turn "0 rows"
  into an SQL _error_ yourself. Working techniques below (json() trick, CHECK guard table, NOT NULL
  scalar subquery, trigger `RAISE`). [local]
- `db.transaction()` does **not** work on D1 (`BEGIN`/`SAVEPOINT` rejected). [src][local]
- Limits are per statement (100 bound params, 100 KB SQL text, 2 MB value/row); no documented
  statement-count cap per batch; whole batch must finish in 30 s. [doc]
- Recommended shape for "apply change + audit + close CR": guarded UPDATEs (optimistic `version`
  / `status='open'` in `WHERE`) each followed by an abort-if-`changes()<>1` statement, all in one
  `db.batch`. Race-free because the batch is one transaction on a single-threaded DB.

## 1. Is Drizzle `db.batch` on D1 one transaction with full rollback?

**Yes.**

- D1 docs: "Batched statements are SQL transactions. If a statement in the sequence fails, then an
  error is returned for that specific statement, and it aborts or rolls back the entire sequence."
  Also: "each statement in the list will execute and commit, sequentially, non-concurrently."
  [doc] <https://developers.cloudflare.com/d1/worker-api/d1-database/#batch>
- Drizzle's D1 driver is a thin pass-through: `SQLiteD1Session.batch()` calls `query._prepare()`,
  binds params, then `await this.client.batch(builtQueries)` — exactly one D1 `batch()` call; no
  extra statements, no client-side transaction emulation. [src]
  `node_modules/drizzle-orm/d1/session.js` (`SQLiteD1Session.batch`), `d1/driver.js`
  (`DrizzleD1Database.batch` → `session.batch`).
  Upstream: <https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/d1/session.ts>
- Drizzle docs page <https://orm.drizzle.team/docs/batch-api> lists allowed builders (`select`,
  `insert`, `update`, `delete`, `db.query.*`, plus `db.run/all/get/values(sql\`...\`)` in source) but
  says nothing D1-specific about atomicity; the driver source + D1 docs are the authority.
- [local] Verified: batch `UPDATE p; UPDATE cr; INSERT audit (bad FK)` → FK error, `p` and `cr`
  unchanged. Same with a Drizzle `db.batch([db.update(...), db.insert(...)])`.

### `db.transaction()` is unusable on D1

- Drizzle D1 `transaction()` issues separate `run("begin")` / `run("commit")` calls. [src]
  `node_modules/drizzle-orm/d1/session.js` (`SQLiteD1Session.transaction`).
- workerd's SQLite authorizer rejects `BEGIN`/`SAVEPOINT` when the regulator disallows transactions
  (`SQLITE_TRANSACTION` / `SQLITE_SAVEPOINT` cases). [src]
  <https://github.com/cloudflare/workerd/blob/main/src/workerd/util/sqlite.c%2B%2B> (search
  `allowTransactions`), message in
  <https://github.com/cloudflare/workerd/blob/main/src/workerd/api/sql.c%2B%2B>.
- D1 docs on imports: remove `BEGIN TRANSACTION`/`COMMIT` or you get "cannot start a transaction
  within a transaction". [doc]
  <https://developers.cloudflare.com/d1/best-practices/import-export-data/>
- [local] `db.transaction(...)` → `Failed query: begin ... To execute a transaction, please use the
  state.storage.transaction() ... instead of the SQL BEGIN TRANSACTION or SAVEPOINT statements.`

## 2. Limits

From <https://developers.cloudflare.com/d1/platform/limits/> [doc]:

| Limit | Value |
| --- | --- |
| Bound parameters per query (statement) | 100 |
| SQL statement length | 100 KB (text, per statement) |
| String / BLOB / row size | 2 MB |
| Arguments per SQL function | 32 |
| Query duration | 30 s — footnote: also applies to the **entire batch call** |
| Queries per Worker invocation | 1000 paid / 50 free |

- "Limits for individual queries (listed above) apply to each individual statement contained within
  a batch statement." No documented max statement count per batch. [doc]
- Whether each batched statement counts against "queries per invocation" is not stated. Assume yes
  (conservative); our batches are ~5 statements so irrelevant.
- [local] 101 bound params → `too many SQL variables`. 2000-statement batch of `SELECT 1` OK.
  Empty batch → `No SQL statements detected` (guard against `db.batch([])` when a diff is empty).
- Implication: a Drizzle `insert(...).values([...many rows])` counts columns×rows toward 100 params;
  chunk multi-row inserts. `json()` function args limit 32 is irrelevant for bound JSON strings.

## 3. Read-check-write without interactive transactions

Why guards are race-free: D1 DB is "inherently single-threaded, and processes queries one at a
time" [doc] (limits page, "Concurrency and throughput"), and a batch is one transaction executed
"sequentially, non-concurrently" [doc]. So a check _inside_ the batch sees the same state the writes
apply to. A check done in a _separate_ earlier query (read in JS, then batch) can race — the
stale-check must be re-expressed inside the batch.

Patterns:

1. **Conditional UPDATE (optimistic concurrency).** Put the precondition in `WHERE`:
   `UPDATE community_profile SET ..., version = version + 1 WHERE id = ? AND version = ?`
   `UPDATE change_request SET status = 'applied' WHERE id = ? AND status = 'open'`.
2. **Detect outcome.** D1 result `meta.changes` per statement [doc]
   <https://developers.cloudflare.com/d1/worker-api/return-object/>; `RETURNING` works inside a batch
   and through Drizzle `.returning()` [local]. But these are only visible _after_ the batch commits —
   too late to roll back. Use them to report, not to guard.
3. **Abort in-batch** — see §4. This is what makes "stale → nothing written" hold.
4. **Guard rows / unique constraints.** Insert a row whose UNIQUE key encodes the transition (e.g.
   audit event `UNIQUE(change_request_id, kind)`): a duplicate apply fails with
   `SQLITE_CONSTRAINT_UNIQUE` → batch rollback. Natural idempotency key, zero extra tables.
5. **Read replicas caveat:** only relevant if `env.D1.withSession(...)` is adopted; then a pre-read
   may be stale. Repo uses `drizzle(env.D1)` (primary only) — `src/db/index.ts`. [doc]
   <https://developers.cloudflare.com/d1/best-practices/read-replication/>

## 4. Can a later statement abort the batch based on an earlier one?

**Not automatically** — [local] a guard `UPDATE ... WHERE version = 99` that matched 0 rows returned
`changes: 0` and the following `INSERT audit` still committed. You must convert "0 rows" into an
error. All four techniques below were verified [local] to roll back every prior statement in the
batch:

### a. `changes()` + `json()` error trick (no schema changes) — recommended

```sql
UPDATE change_request SET status='applied' WHERE id=? AND status='open' AND base_version=?;
SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('stale') END;   -- 'malformed JSON' → rollback
UPDATE community_profile SET ..., version=version+1 WHERE id=? AND version=?;
SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('stale') END;
INSERT INTO audit_event (...) VALUES (...);
```

- `changes()` = rows changed by the most recent completed INSERT/UPDATE/DELETE on the connection
  (SQLite: <https://www.sqlite.org/lang_corefunc.html#changes>). A SELECT does not reset it.
  `changes`, `json`, `iif`, `coalesce`, `nullif` are on workerd's `ALLOWED_SQLITE_FUNCTIONS`
  allowlist [src] (workerd `sqlite.c++`); D1 docs point to that list [doc]
  <https://developers.cloudflare.com/d1/sql-api/sql-statements/#supported-sqlite-extensions>.
- `CASE` short-circuits, so `json('stale')` only evaluates on failure.
- Drizzle form [local, works]:
  ```ts
  const assertOneRow = () => db.run(sql`SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('stale') END`);
  await db.batch([
  	db.update(changeRequest).set({ status: "applied" }).where(and(eq(changeRequest.id, crId), eq(changeRequest.status, "open"), eq(changeRequest.baseVersion, v))),
  	assertOneRow(),
  	db.update(profile).set({ ...patch, version: sql`${profile.version} + 1` }).where(and(eq(profile.id, pid), eq(profile.version, v))).returning(),
  	assertOneRow(),
  	db.insert(auditEvent).values({...}).returning({ id: auditEvent.id }),
  ]);
  ```
  Error surfaces as `D1_ERROR: malformed JSON: SQLITE_ERROR` — catch and map to a "stale" domain
  error (match on message; there's no custom message channel). Replaying the same batch after
  success also fails (idempotent).
- [local]-only; `changes()` across batch statements relies on all statements sharing one
  connection — implied by "SQL transaction" [doc] but smoke-test on remote.

### b. CHECK-constraint guard table (clearer error text)

```sql
CREATE TABLE _guard (ok INTEGER NOT NULL CHECK (ok = 1));        -- migration, stays empty
INSERT INTO _guard (ok) VALUES (changes());                       -- fails unless 1 → rollback
-- or: INSERT INTO _guard (ok) SELECT count(*) FROM change_request WHERE id=? AND status='open';
```

Error: `CHECK constraint failed: ok = 1`. On success a row _is_ inserted — follow with
`DELETE FROM _guard` in the same batch, or use the `json()` variant instead.

### c. NOT NULL scalar subquery (guard folded into the audit insert)

```sql
INSERT INTO audit_event (profile_id, ...)
VALUES ((SELECT id FROM community_profile WHERE id=? AND version=?), ...);
```

Subquery returns NULL when stale → `NOT NULL constraint failed` → rollback. Note: must be order-
placed _before_ the UPDATE that bumps `version`, or check the post-bump value.

### d. Trigger with `RAISE(ABORT, ...)` (schema-enforced invariant)

```sql
CREATE TRIGGER change_request_no_reclose BEFORE UPDATE OF status ON change_request
WHEN OLD.status <> 'open' BEGIN SELECT RAISE(ABORT, 'change request already closed'); END;
```

Works on D1 [local]; error `SQLITE_CONSTRAINT_TRIGGER` with the custom message; whole batch rolled
back. Triggers are authorized by workerd (`SQLITE_CREATE_TRIGGER` case) [src]. `RAISE` outside a
trigger → `RAISE() may only be used within a trigger-program` [local], so it can't be inlined in a
batch statement. Good for invariants (no re-closing, no edit after archive), not for per-request
version checks. Must be created via a hand-written migration (drizzle-kit doesn't model triggers).

Not viable: `PRAGMA ignore_check_constraints` toggling, `BEGIN`/`SAVEPOINT`, client-side
inspection of `meta.changes` (post-commit).

## 5. Gotchas

### JSON columns

- Repo has `customFieldData: blob({ mode: "json" })` (`src/db/app-schema.ts:64`).
- Drizzle `blob({mode:"json"})` → `Buffer.from(JSON.stringify(v))` on write, `JSON.parse` on read
  [src] `node_modules/drizzle-orm/sqlite-core/columns/blob.js`. Needs `nodejs_compat` (enabled in
  `wrangler.jsonc`). Works in batch [local].
- Drizzle docs: "It's recommended to use `text('', { mode: 'json' })` instead of
  `blob('', { mode: 'json' })`" because JSON functions historically error on BLOB args [doc]
  <https://orm.drizzle.team/docs/column-types/sqlite#blob>. [local] `json_extract` on the
  blob-stored JSON returned the value (newer SQLite accepts it), but don't rely on it for in-SQL
  guards/diffs without a remote check. Prefer `text({mode:"json"})` for new columns (Audit Event
  before/after payloads).
- Size: each bound JSON value ≤ 2 MB; bound values don't count toward the 100 KB SQL-text limit
  (that limit is "SQL statement length") — but `sql.raw`/inlined JSON would. Keep values bound.
- The `json('stale')` abort trick is unrelated to JSON columns; but a bad JSON in an actual
  `json(...)` call in your SQL would also abort the batch — same error text. Use a distinctive
  literal and/or the CHECK guard (§4b) if you need unambiguous error mapping.

### Foreign keys / `defer_foreign_keys`

- FKs enforced by default (equivalent to `PRAGMA foreign_keys = on` every transaction); can't be
  turned off in a query. [doc] <https://developers.cloudflare.com/d1/sql-api/foreign-keys/>
- `PRAGMA defer_foreign_keys = on` defers checks to end of current transaction; unresolved
  violations at commit → `FOREIGN KEY constraint failed`. "D1 PRAGMA statements only apply to the
  current transaction." [doc] <https://developers.cloudflare.com/d1/sql-api/sql-statements/>
- [local] In a batch: `PRAGMA defer_foreign_keys = on` as first statement, then child-before-parent
  inserts → success. Without it → FK error + rollback. Next separate query → FK enforced again
  (pragma doesn't leak). So the pragma works per batch.
- Deferring does **not** stop `ON DELETE CASCADE` from firing. [doc] (sql-statements page)
- FK errors are immediate (non-deferred) by default, so order statements parent → child; failure
  rolls back the whole batch [local].

### Misc

- `db.batch([])` throws (`No SQL statements detected`) [local].
- Results are positional; Drizzle maps each entry by builder type (`.returning()` → rows array,
  `db.run` → raw D1 result with `meta.changes`) [local][src].
- Error object: Drizzle wraps as `Failed query: ...` only for single queries; batch errors surface
  as raw `D1_ERROR: <sqlite msg>: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_*)` [local]. The
  extended code is useful for mapping (UNIQUE → already applied, CHECK/json → stale, TRIGGER → closed).

## Open / unverified

- §4a/§4b/§4d verified locally only; one remote smoke test recommended before shipping.
- Whether batch statements count individually toward the 1000 queries/invocation limit (undocumented).
