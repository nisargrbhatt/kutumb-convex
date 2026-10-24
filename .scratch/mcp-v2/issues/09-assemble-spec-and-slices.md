# Assemble spec and implementation slices

Type: grilling Status: resolved Blocked by: 04, 05, 06, 07, 08, 10, 11

## Question

Write `.scratch/mcp-v2/spec.md` from the resolved tickets and slice it into implementation
tickets (`issues/12+`). Graduate any remaining fog (e.g. `list_my_requests`)
or rule it out of scope. Note any ADRs owed (write scope incl. live consent-scope check per **Read-only downgrade of a write Connection**, AI attribution + quotas counted from Audit Events, org data version + versioned graph cache keys).


## Answer

Grilled 2026-10-24. Spec: [spec.md](../spec.md). ADRs
[0006](../../../docs/adr/0006-mcp-write-needs-live-consent-and-org-toggle.md) (write = token ∩
live consent ∩ org toggle; shrink-only downgrade; `update-consent` disabled),
[0007](../../../docs/adr/0007-ai-attribution-snapshot-and-quotas-from-audit.md) (`viaClient*`
snapshot columns; daily quotas from attributed Audit Events),
[0008](../../../docs/adr/0008-org-data-version-and-versioned-graph-keys.md) (`orgDataVersion` +
immutable versioned graph keys).

- **Fog**: `list_my_requests` ruled out of scope (per-profile `myPendingRequests` covers
  read-your-writes; addable later, non-breaking).
- **Org toggle storage**: new `orgSetting(organizationId PK, aiClientWrites bool)`, missing row =
  on (not better-auth `organization.metadata`, not on `orgDataVersion`).
- **Analytics**: `mcp_tool_called` + `outcome`; `mcp_connection_created` + `write`; new
  `connection_downgraded`, `ai_client_writes_toggled`. No values/names.
- **Testing**: seam via `freshDb`, MCP tool harness (gating matrix, quotas, filters, idempotency),
  graph with injected KV/LRU fakes. No remote-D1 smoke (no new D1 technique).
- **Quotas ship with first write tools** (slice 19), so no write tool is ever unthrottled.

Slices (AFK unless noted, app shippable after each):
{[12 graph cache](12-graph-cache-versioned.md), [13 custom field reads](13-custom-field-reads.md),
[16 write scope + gating](16-write-scope-and-gating.md),
[18 attribution + pending limit](18-attribution-and-pending-limit.md)} →
{[14 shared filters](14-shared-filters.md), [17 Manage drawer](17-connections-manage-drawer.md),
[19 profile write tools](19-profile-write-tools.md)} →
{[15 count_profiles](15-count-profiles.md),
[20 relation + address tools](20-relation-address-write-tools.md)} →
[21 docs](21-mcp-guide-write-docs.md) → [22 claude.ai smoke](22-claude-ai-smoke.md) (HITL).
