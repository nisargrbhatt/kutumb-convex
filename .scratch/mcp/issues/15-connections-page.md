# Connections page (/profile/ai)

Type: AFK
Status: open
Blocked by: 10

Spec: [spec.md § AI settings UI, Auth stack (Ending a Connection)](../spec.md)

## What to build

Route `/profile/ai` + "AI" Profile nav item, breadcrumb Home › Profile › AI. Query fn listing the
user's consents joined with client + org + newest RT `createdAt`. Table (client+host, community,
connected, last used, status Active/Expired, revoke). Community filter (default active org, "All").
Revoke server fn: delete consent + revoke its RTs; `ConfirmDialog`. `afterRemoveMember` deletes
consents for that org. PostHog `mcp_connection_revoked`. Empty state with "Connect AI client" CTA
(drawer is slice 16; button may be stubbed until then).

## Acceptance criteria

- [ ] lists only own Connections; filter works; responsive (community folds into client cell <sm)
- [ ] revoke → next MCP call 401, refresh → `invalid_grant`
- [ ] removing member deletes their consents for that org
- [ ] Last used "Never" / relative; Expired after 30d without refresh
