# Graph cache: org data version + versioned keys

Type: AFK Status: open Blocked by:

Spec: [spec.md § Graph cache](../spec.md), ADR 0008

## What to build

- Migration: `orgDataVersion(organizationId PK, version int)`; missing row = 0.
- `makeProfileChanges`: every applied plan upserts `version + 1` in its batch; `requested`-only
  plans don't. Remove `graphChanged`, `onGraphChanged`, `invalidateOrgGraph`.
- `src/domain/queries/graph.ts` (injected KV + LRU deps): read version → `graph:{org}:v{n}` →
  isolate LRU (cap 10 orgs) → KV (24h TTL) → D1 rebuild (version + data in one `db.batch`, KV put
  via `waitUntil`).
- Rewire `getFocusedCommunityGraph`, `searchCommunityProfilesLite`, `get_family_graph` onto it;
  delete `src/lib/communityGraphCache.ts` paths.

## Acceptance criteria

- [ ] seam tests: applied → version +1 in same batch; requested-only and rollback → no bump
- [ ] graph tests with fakes: LRU hit, KV hit, rebuild + put; new version → new key; rebuild
      returns data matching its version
- [ ] app graph page + quick search and `get_family_graph` show a write on the next read
- [ ] no `onGraphChanged` / old `tree:graph:*` writes remain
