# Remote-D1 guard smoke test

Type: AFK Status: ready-for-agent Blocked by:

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

- [ ] results table (technique × pass/fail) appended to
  `.scratch/profile-lifecycle/research/01-d1-batch-atomicity.md` (branch
  `research/d1-batch-atomicity`) or to this ticket's Resolution
- [ ] chosen technique stated; if (a) fails, spec § Atomicity updated to the fallback
- [ ] throwaway DB deleted, no change to `wrangler.jsonc`
