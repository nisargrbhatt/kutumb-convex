# D1 batch atomicity via Drizzle

Type: research
Status: resolved
Blocked by:

## Question

Applying a change and writing its Audit Event (and closing the Change Request) must be atomic. D1
has no interactive transactions. Confirm against primary sources (Cloudflare D1 docs, Drizzle
docs/source for the D1 driver):

- Does Drizzle `db.batch([...])` on D1 run as one SQL transaction with full rollback on failure?
- Statement-count / size limits per batch; bound-parameter limits.
- Patterns for "read, check, then write" without interactive transactions (conditional
  `UPDATE ... WHERE` + `changes()`/`RETURNING`, guard rows) so stale-check + apply can't race.
- Can a batch statement depend on a prior statement's result (e.g. abort if a guard update touched
  0 rows)?
- Any gotchas with `json` blob columns or foreign keys (deferred FK checks) inside a batch.

## Answer

Resolved 2026-10-10 (research). Verified against D1 docs, drizzle-orm 0.45.2 D1 driver, workerd
source; techniques run on local D1 (miniflare) only.

- `db.batch([...])` = one SQL transaction, full rollback on any failure. `db.transaction()` and
  `SAVEPOINT` are unusable on D1.
- Limits are per statement: 100 bound params, 100 KB SQL text, 2 MB per value/row. 30 s per batch
  call. No documented statement-count cap (2000 worked locally).
- Race-free check only if inside the batch: guard in `WHERE` (`id=? AND version=?`,
  `status='pending'`). `RETURNING`/`meta.changes` are only visible post-commit.
- A 0-row guard UPDATE does **not** abort the batch by itself; must convert to an error. Working
  techniques: (a) `SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale') END` (recommended, no
  schema change); (b) CHECK guard table; (c) NOT NULL scalar subquery in audit insert;
  (d) `RAISE(ABORT)` trigger (hand-written migration). UNIQUE guard rows make apply idempotent.
- Use `text({mode:"json"})` for new payload columns; bind JSON as params. FKs always on;
  `PRAGMA defer_foreign_keys` is per batch. Errors arrive as `D1_ERROR … SQLITE_CONSTRAINT_*` →
  map to domain errors (stale / already applied / closed).
- Unconfirmed: remote-D1 smoke test of (a)/(b)/(d) + `changes()` across statements; whether
  batched statements count individually toward the 1000-queries/invocation limit.

Full findings: branch research/d1-batch-atomicity,
.scratch/profile-lifecycle/research/01-d1-batch-atomicity.md
