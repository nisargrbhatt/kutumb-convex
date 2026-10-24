# Volume and abuse guardrails for AI-driven writes and reads

Type: grilling Status: resolved Blocked by: 05

## Question

How do we keep AI Clients from dumping data or hammering reads? Settle:

- Per-Connection write quotas (per minute/day, by kind) separate from the read rate limit.
- Duplicate-create detection (name + DOB + relation heuristics; warn vs block).
- Pending Change Request caps per submitter.
- Read response-size budgets and page caps.
- How the Connection/AI Client is recorded on Audit Events and Change Requests, and shown in
  Reviews/History.
- Owner/admin controls, e.g. disabling AI writes per org.


## Answer

Resolved 2026-10-24 (grilling).

- **Write quotas** (per Connection, every role, separate from reads):
  - Burst: 10 write-tool calls/min via a 2nd CF RL binding; counts every call.
  - Daily: 200 writes/rolling 24h, all kinds pooled; `create_profile` sub-cap 50/24h.
  - Daily counted from attributed Audit Events (`viaClientId` + actor + org, existing
    `auditEvent_org_actor_created_idx`). No counter table. Only `applied`/`requested` count;
    `unchanged`, `possible_duplicate`, errors don't.
  - Exceeded → tool `isError` "Write quota reached, resets in ~N min". Never HTTP 429.
  - RL keys include org: `clientId:userId:orgId` (also fix existing read limiter key).
- **Attribution**: nullable `viaClientId` + `viaClientName` (snapshot) on `auditEvent` and
  `changeRequest`; null = in-app. Not the consent id (dies on disconnect). Review events are by the
  reviewer in-app, so unattributed. "via <client name>" badge in Reviews, profile History, My
  requests; no source filter in v1.
- **Duplicate create**: match = trimmed, case-insensitive firstName+lastName among profiles the
  Actor can read; both DOBs set and different → no match. Match → nothing written, outcome
  `possible_duplicate` (not `isError`), ≤5 candidates `{id,name,dateOfBirth,status}`, message to
  confirm with user. `allowDuplicate: true` forces. MCP edge only. No same-payload time window.
- **Pending request limit**: 50 pending Change Requests per submitter per org,
  `PENDING_REQUEST_LIMIT` in `src/lib/limits.ts`, enforced in `makeProfileChanges` (app + MCP),
  `LimitReached`.
- **Read budgets**: no additions. Search ≤100/page, graph node cap, `get_profile` bounded by custom
  field caps. No daily read cap, no field projection in v1 (in-app visibility is the same, so paging
  isn't escalation).
- **AI Client writes toggle**: org setting, default on, owner-only, stored in org settings. Off →
  write tools hidden for every role, `whoami.canWrite:false` + reason "disabled by your community".
  Reads unaffected. Mid-flight off: pending AI-attributed Change Requests stay reviewable;
  Connections keep `community:write` (works again when back on); no notification. Toggle UI folded
  into **Consent and Connections UI for write scope**.
- **Glossary**: added attribution (Audit Event), pending request limit (Change Request), write
  grant + AI Client writes + write quota (Connection); AI Client widened to changes.
- **ADR owed** (spec assembly): AI attribution as snapshot columns + quotas counted from Audit
  Events.
