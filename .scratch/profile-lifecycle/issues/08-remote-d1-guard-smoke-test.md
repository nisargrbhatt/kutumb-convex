# Remote-D1 guard smoke test

Type: AFK Status: resolved Blocked by:

Spec: [spec.md § Atomicity](../spec.md)

## What to build

Prove the in-batch guard technique on **remote** D1 (local miniflare already passed, see
[D1 batch atomicity via Drizzle](01-d1-batch-atomicity.md)). Create a throwaway remote D1
(`wrangler d1 create kutumb-guard-smoke`), run via `wrangler d1 execute --remote` and a tiny
Worker/script using Drizzle `db.batch`:

- (a) `SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale') END` after a 0-row guarded UPDATE →
  whole batch rolls back; after a 1-row UPDATE → commits.
- (b) CHECK guard table, (d) `RAISE(ABORT)` trigger: same assertions.
- `changes()` reflects only the immediately preceding statement across batch statements.
- Whether batched statements count individually toward the 1000-queries/invocation limit (doc or
  observed).

Delete the DB afterwards. If wrangler is not authenticated → stop, hand human a checklist (HITL).

## Acceptance criteria

- [x] results table (technique × pass/fail) appended to
  `.scratch/profile-lifecycle/research/01-d1-batch-atomicity.md` (branch
  `research/d1-batch-atomicity`) or to this ticket's Resolution
- [x] chosen technique stated; if (a) fails, spec § Atomicity updated to the fallback
- [x] throwaway DB deleted, no change to `wrangler.jsonc`

## Answer

Resolved 2026-10-10. Remote D1 (APAC) via throwaway Worker + drizzle-orm 0.45.2 `db.batch`, and
`wrangler d1 execute --remote`. Harness: [smoke/](../smoke/) (`worker.ts`, `wrangler.jsonc`).
Throwaway DB `kutumb-guard-smoke` and Worker deleted; `wrangler.jsonc` (app) untouched.

**Chosen: (a)** `SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale') END` right after each
guarded DML. No schema change. Spec § Atomicity unchanged except gotcha notes.

Batch: `INSERT audit 'pre'; guarded UPDATE (id=1 AND version=?); <guard>; INSERT audit 'post'`.

| Technique | 0-row UPDATE (stale) | 1-row UPDATE (fresh) | Error surfaced |
| --- | --- | --- | --- |
| (a) `changes()` + `json('stale')` | pass: whole batch rolled back ('pre' gone) | pass: commits | `D1_ERROR: malformed JSON: SQLITE_ERROR` |
| (b) CHECK guard table | pass | pass | `CHECK constraint failed … SQLITE_CONSTRAINT_CHECK` |
| (d) `RAISE(ABORT,'stale')` trigger | pass | pass | `stale: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_TRIGGER)` |
| (a) via `wrangler d1 execute --remote` multi-stmt | pass (rolled back) | — | `malformed JSON` [code 7500] |

- `changes()` across batch statements: UPDATE 3 rows → 3; UPDATE 0 rows → 0; UPDATE 2 rows,
  `SELECT 1`, then `changes()` → 2; INSERT 1 → 1. So it = last completed INSERT/UPDATE/DELETE
  (SELECTs don't reset it), not "previous statement". Guard must follow its DML with no other DML
  between.
- Query limit: one `batch()` = one API request. Batches of 60/1100/5000 `SELECT 1` OK in one
  invocation; serial awaits stopped at 1000 (`Too many API requests by single Worker invocation`).
  Account is paid (60 serial OK, free cap is 50). Statements inside a batch don't count individually.
- Gotcha: drizzle `db.run(sql\`…${param}\`)` (raw SQL with bound params) inside `db.batch` throws
  `Cannot read properties of undefined (reading 'bind')` (session.js uses `preparedQuery.stmt`,
  undefined for raw sql). Param-less raw sql and query builders work. Use builders for guarded DML.
