Label: wayfinder:map

# MCP v2: custom fields, write tools, caching

## Destination

A spec at `.scratch/mcp-v2/spec.md` plus sliced implementation tickets at `.scratch/mcp-v2/issues/`
for: (a) read tools that expose and reason over the org's Custom Field Definitions and Values,
(b) write tools for Community Profiles that run through `makeProfileChanges`, so the lifecycle and
Change Requests stay the same as in the app, and (c) caching and volume guardrails for AI-driven
read and write load.

## Notes

- Domain: `GLOSSARY.md` terms **Actor**, **Connection**, **AI Client**, **Community Profile**,
  **Userless Profile**, **Change Request**, **Audit Event**, **Custom Field Definition**,
  **Custom Field Value**, **Member limit**. Relation direction per ADR 0001; auth per ADR 0004;
  audit retention per ADR 0005.
- Skills to consult: `grilling` + `domain-modeling` (default), `codebase-design`,
  `tanstack-start-best-practices`, `better-auth-best-practices`,
  `better-auth-security-best-practices`, `workers-best-practices`.
- Prior maps: [MCP server](../mcp/map.md) (v1, read-only),
  [profile lifecycle](../profile-lifecycle/map.md) (mutation seam, Change Requests). Both had ruled
  write tools out of scope. This effort redraws that boundary.
- Existing code:
  - `buildMcpServer()` (`src/server/mcp/server.ts`) runs per request, so tool schemas and
    descriptions can be built per org/Actor.
  - `get_profile` returns only the custom fields that have a value. No tool lists definitions, and
    search can't filter on custom fields.
  - Writes: `makeProfileChanges` (`src/domain/profileChanges.ts`) offers `submit` with 7 kinds and
    routes direct (owner/admin) vs Change Request (member). Its `onGraphChanged` hook
    (`src/lib/profileChanges.ts`) is the existing invalidation point.
  - Cache: only the KV graph blob per org (`src/lib/communityGraphCache.ts`), 1h TTL, deleted on
    write. `get_profile` makes about 6 uncached D1 queries.
  - Guardrails: 1000 profiles/org (ADR 0003); `/api/mcp` limited to 60/min per `clientId:userId`.
- Settled at charting (2026-10-22):
  - One map covers all three threads.
  - Main read bug: the LLM sees only the core schema fields, not Custom Field Definitions/Values.
    Industry practice is researched before the design is chosen.
  - New OAuth scope `community:write`, opt-in and shown separately at consent. Existing
    Connections stay read-only until the member reconnects.
  - Write tools cover the 7 `submit` kinds only. No review, withdraw, deactivate, delete or
    reassign. Owner/admin writes apply directly; member writes become Change Requests.
  - Single-item write tools only (no batch), plus per-Connection write quotas on top of the
    Member limit.
  - Caching lives in the shared `domain/queries` layer (app + MCP), invalidated through the
    mutation seam.
  - Audit Events and Change Requests record the Connection/AI Client that made the change.
  - Read-your-writes: an AI Client always sees its own writes on its next read. (Caching design
    tightened this to zero lag for everyone.)

## Decisions so far

<!-- one line per closed ticket -->

- [Industry practice for exposing tenant-defined fields to LLMs over MCP](issues/01-custom-field-exposure-practice.md):
  static tool schemas; discover via `list_custom_fields` + `whoami`; full defs (null values) in
  `get_profile`; generic `[{field,value}]` filters/writes. Dynamic schemas break under client caching.
- [MCP write-tool practice](issues/02-write-tool-practice.md): annotations are hints; host prompt is
  the only portable confirm (no elicitation on claude.ai). Versions + natural keys, no idempotency
  keys. `requested` outcome for pending. Hide write tools w/o scope; defer step-up.
- [Cloudflare caching options for per-org reads](issues/03-cf-caching-options.md): KV can't give
  read-your-writes; current delete-on-write is racy. Use a D1 per-org `graphVersion` + immutable
  versioned keys (isolate LRU → KV → D1). Blob ≈0.4–0.9 MiB. Skip Cache API/DO.
- [Custom field exposure design](issues/04-custom-field-exposure-design.md): defs in `whoami` +
  `list_custom_fields`; id-or-label refs, unique labels on add; full defs in `get_profile`; typed
  search filters; strict patch writes with `YYYY-MM-DD` dates; cap 50 defs, 500-char text.
- [Write tool catalogue and shapes](issues/05-write-tool-catalogue.md): 7 per-kind tools; patch
  updates + `expectedVersion`; `get_profile` exposes versions, relation ids, own drafts + pending
  requests; ids/version in results; typed error hints; hidden w/o scope; `unchanged` on repeats.
- [Volume and abuse guardrails for AI-driven writes and reads](issues/06-volume-abuse-guardrails.md):
  per-Connection quotas (10/min, 200/day, 50 creates/day) counted from attributed Audit Events;
  `viaClient*` snapshot columns + badge; name+DOB `possible_duplicate`; 50 pending/submitter; no new
  read budgets; owner toggle for AI writes (default on).
- [Caching design for shared domain reads](issues/07-caching-design.md): cache graph blob only
  (everything else live D1); `orgDataVersion` table bumped in the apply batch; isolate LRU → KV →
  D1 under `graph:{org}:v{n}`; zero lag for all; org-only key; shared `domain/queries/graph.ts`.
- [Consent and Connections UI for write scope](issues/08-write-consent-ui-prototype.md): variant B.
  Read only / Read and make changes radio cards (scope subset at consent); icons + Manage drawer
  (Make read only, reconnect to upgrade); owner radio on new Settings → AI tab; "via" byline.
- [Aggregate and core-filter read tools](issues/10-aggregate-read-tools.md): one `count_profiles`
  (count only, single groupBy, ≤50 groups + other/null); shared filter object w/ search (blood group,
  DOB range, city/state/country, `living`, custom); multi-address overlap; text/boolean custom groupBy.
- [Read-only downgrade of a write Connection](issues/11-read-only-downgrade.md): drop write from
  consent scopes only; write = token ∩ live consent ∩ org toggle (zero lag); tokens untouched;
  `WriteNotAllowed` reasons; no Audit Event; reconnect to re-upgrade; disable plugin update-consent.
- [Assemble spec and implementation slices](issues/09-assemble-spec-and-slices.md): [spec](spec.md)
  + ADRs 0006–0008; `orgSetting` table for toggle; slices 12–22 (quotas ship with first write
  tools; HITL claude.ai smoke last).

## Not yet specified

<!-- empty: all fog graduated or ruled out -->

## Out of scope

- Batch/bulk write tools (decided at charting).
- Reviews, withdraw, deactivate, delete and reassign via MCP.
- Writes to Custom Field Definitions (org schema) via MCP.
- In-app chat, where Kutumb calls an LLM itself.
- Normalising the app's stored custom-field dates (`DatePicker` writes `toJSON()` of local
  midnight, so values can be a day off in UTC). This is an app bug, not part of this map. MCP only
  converts at its edge.
- `list_my_requests` tool ([Assemble spec and implementation slices](issues/09-assemble-spec-and-slices.md)):
  per-profile `myPendingRequests` covers read-your-writes; app My requests page covers the rest.
