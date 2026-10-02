# Connections page (/profile/ai)

Type: AFK Status: resolved Blocked by: 10

Spec: [spec.md § AI settings UI, Auth stack (Ending a Connection)](../spec.md)

## What to build

Route `/profile/ai` + "AI" Profile nav item, breadcrumb Home › Profile › AI. Query fn listing the
user's consents joined with client + org + newest RT `createdAt`. Table (client+host, community,
connected, last used, status Active/Expired, revoke). Community filter (default active org, "All").
Revoke server fn: delete consent + revoke its RTs; `ConfirmDialog`. `afterRemoveMember` deletes
consents for that org. PostHog `mcp_connection_revoked`. Empty state with "Connect AI client" CTA
(drawer is slice 16; button may be stubbed until then).

## Acceptance criteria

- [x] lists only own Connections; filter works; responsive (community folds into client cell <sm)
- [x] revoke → next MCP call 401, refresh → `invalid_grant` (by construction + DB-state tests; not
      exercised against a live client: slice 17)
- [x] removing member deletes their consents for that org
- [x] Last used "Never" / relative; Expired after 30d without refresh

## Resolution

- `/profile/ai` (`routes/_authed/_community/profile/ai/index.tsx`) + "AI" Profile nav item;
  breadcrumb Home › Profile › AI. Loader preloads; community filter is client-side over the caller's
  own list (default active org, "All communities"). Empty state (no Connections at all) with CTA;
  `ConnectAiClientButton` is a **disabled stub** until slice 16.
- `domain/queries/connections.ts`: `listConnections` (consent ⋈ client ⋈ org, own `userId` only),
  `revokeConnection(userId, consentId)` (null if not theirs), `removeMemberConnections`. Revoke =
  set `revoked` on matching refresh + access tokens, **then** delete consent (failure leaves it
  visible/retryable). Plugin refresh rejects `revoked` tokens → `invalid_grant`; MCP verify needs
  the consent → 401.
- `domain/connections.ts`: **Last used** = newest refresh-token `createdAt` since the consent was
  created, only once ≥2 tokens exist (first token = connect time) else "Never". **Expired** = no
  token for >30d (from connect time if none). Tokens older than the consent are ignored so a
  revoke→reconnect starts "Never".
- Server fns `server/connections.ts` (`getMyConnections`, `revokeMyConnection`); PostHog
  `mcp_connection_revoked {orgId, clientId}` on user revoke only (not on member removal).
- `organizationHooks.afterRemoveMember` drops the member's consents for that org. Also
  `/organization/leave` (after-hook): better-auth fires no `afterRemoveMember` there. Both swallow +
  log errors (member already removed; live check still 401s).
- Extracted `clientHost` / `clientDisplayName` (mcpOauth) shared with consent screen.
- **Deviations**: Connected column also hidden <`md` (width); revoke also revokes access-token rows
  (harmless, JWTs are checked live anyway).
- Not run: browser check of the page (needs seeded login), real-client revoke (slice 17).
