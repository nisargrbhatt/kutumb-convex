# Caching design for shared domain reads

Type: grilling Status: resolved Blocked by: 03

## Question

What gets cached, and how is it kept correct? Settle:

- Candidates: Custom Field Definitions per org, profile detail, search, graph blob, counts.
- Store for each candidate (from research).
- Keys, including Actor/role dimensions given the visibility rules.
- Invalidation through `makeProfileChanges` (`onGraphChanged` → broader hook) and the custom field
  definition edit paths.
- How read-your-writes is met for the writing Actor.
- The staleness bound for others.
- Whether the app's server fns adopt the same layer.


## Answer

Resolved 2026-10-24 (grilling).

- **Cached**: org graph blob only. Custom Field Definitions, profile detail, `search_profiles`,
  counts/aggregates stay live D1 (single indexed queries at ≤1000 profiles). `get_profile` latency
  fixed by `Promise.all` over its queries, not caching. Aggregate tools → D1 `GROUP BY` /
  `json_extract`, independent of cache.
- **Version store**: own table `orgDataVersion(organizationId PK, version int)`, not a column on
  better-auth `organization`. Missing row = 0. No seeding.
- **Bump**: every applied `makeProfileChanges` plan upserts `version = version + 1` in the same D1
  batch. `requested` (Change Request only) doesn't bump. Drop `graphChanged`, `onGraphChanged`,
  `invalidateOrgGraph`; no KV touch on write. Def add/delete don't bump (defs not in blob).
- **Lookup**: read version (1 PK read) → key `graph:{org}:v{n}` → isolate LRU (cap 10 orgs) → KV
  (immutable, 24h TTL for GC only) → D1 rebuild. Rebuild reads version + data in one `db.batch`
  (consistent snapshot, never older data under newer version); KV put in `waitUntil`. Stampede
  accepted. Old `tree:graph:*` keys expire within 1h.
- **Staleness**: zero lag for every Actor; read-your-writes for free, no per-client state. Version
  read only on blob-using requests (graph page, quick search, `get_family_graph`), not every page.
  Replaces charting's "others may lag" allowance.
- **Keys/visibility**: Actor-independent blob: active profiles, edges between them, email/mobile
  included (members already see them in-app). Key has no role/Actor dimension. Graph stays
  active-only for all; caller's drafts and own non-active profile only via `get_profile` /
  `myPendingRequests`.
- **Placement**: move to `src/domain/queries/graph.ts` with injected store deps (KV, LRU) for
  tests; version bump statement in the domain seam. App (`getFocusedCommunityGraph`,
  `searchCommunityProfilesLite`) and MCP share it. TanStack Query client cache unchanged.
- **ADR owed** (spec assembly): per-org D1 version + immutable versioned keys instead of KV
  delete-on-write.

Facts found: all profile/relation/address writes go through `makeProfileChanges`; defs written only
in `src/server/fields.ts`; visibility is row-level (status) only, no field-level rules.
