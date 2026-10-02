# Assemble spec and implementation slices

Type: grilling Status: resolved Blocked by: 04, 05, 06, 07

## Question

Write `.scratch/mcp/spec.md` from the resolved decisions and any fog that has graduated. Then slice
it into vertical implementation tickets, agreeing the slice order with the user.

## Answer

Grilled 2026-10-02. Spec: [spec.md](../spec.md). Fog graduated:

- **Last used** = newest `oauthRefreshToken.createdAt` per Connection (accurate to ~1h, no per-call
  writes).
- **Rate limits**: better-auth `customRules` (register 5/h/IP, token + authorize 30/min) + CF
  `ratelimits` binding on `/api/mcp`, 60/min per `clientId:userId` → 429.
- **PostHog**: `mcp_tool_called`, `mcp_connection_created`, `mcp_connection_revoked`; never
  inputs/outputs.
- **Setup guide**: public `/(public)/docs/mcp`, client-steps data shared with the drawer.
- Static API key + admin oversight → out of scope.
- E2E via `cloudflared` tunnel (no staging Worker).

Slices (numbered after the decision tickets): [09 upgrade](09-better-auth-1-7-upgrade.md) →
[10 OAuth+DCR](10-oauth-provider-and-dcr-flow.md) → {[11 CIMD](11-cimd-support.md),
[12 endpoint+whoami](12-mcp-endpoint-and-whoami.md), [15 Connections page](15-connections-page.md)}
→ {[13 profile tools](13-profile-tools.md), [16 drawer+docs](16-connect-drawer-and-docs-page.md)} →
[14 graph](14-family-graph-tool.md) → [17 real-client E2E](17-real-client-e2e.md) (HITL).
