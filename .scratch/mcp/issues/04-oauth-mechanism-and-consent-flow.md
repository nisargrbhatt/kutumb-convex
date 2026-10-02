# OAuth mechanism and consent flow

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Which better-auth plugin backs MCP OAuth, and what is the consent flow? Settle:
- the login → consent → org-picker screens (route, layout, what's shown to the member)
- how the chosen org is stored on the Connection
- how a token resolves to an Actor with a live membership and role check
- revocation semantics
Record an ADR if the choice is hard to reverse.

Also, from ticket 01: we must support both CIMD and DCR, match loopback redirects ignoring the port,
emit `iss` (RFC 9207), and rotate refresh tokens.

Also, from ticket 02:
- Should we stay on core 1.6 with `oauth-provider`, or upgrade to 1.7 and use `@better-auth/mcp`?
- Does `oauth-provider` support CIMD? Research didn't confirm it.
- A custom disconnect must also revoke the refresh tokens.
- Access tokens need a short TTL.
- DCR needs both flags, and we need our own `.well-known` routes at the site root.

## Answer

Grilled 2026-09-26. ADR: [0004](../../../docs/adr/0004-mcp-oauth-connection-is-consent.md).

- **Stack**: upgrade core to latest (**1.7.6**) → `@better-auth/mcp` + `@better-auth/cimd` + `jwt()`.
  Supports **CIMD + DCR** (both DCR flags on). Upgrade = **own first slice**, no MCP in it:
  - rate limiter rewritten to 1.7 atomic `consume()` on **D1** (`INSERT … ON CONFLICT DO UPDATE …
    RETURNING`, `rate_limit` table); drop KV get/set shim.
  - Drizzle migration (new oauth tables, compound indexes); re-verify `requireLocalEmailVerified`
    default + startup schema validation.
- **CIMD fetcher** (ours; no `@better-auth/cimd/node` on Workers): https only; reject own-origin +
  IP-literal hosts; no redirects; 5s timeout, 64KB cap; JSON `client_id` must === URL; KV cache ~1h.
  No host allowlist; consent is the human gate.
- **Screens**: top-level routes `/oauth/select-org` (`postLogin.page`) + `/oauth/consent`
  (`consentPage`), own session gate (not under `_authed`), `AuthCardShell`. `loginPage` = existing
  `/login`, returns to authorize URL. Picker always shown, active org pre-selected. 0 orgs → error card
  + link `/onboarding/create`, flow ends. Pick uses `organization.setActive` (accepted side effect:
  web session's active org switches).
- **Scopes**: `community:read` + `offline_access`. No finer scopes.
- **Connection = one `oauthConsent` row `(clientId, userId, referenceId=orgId)`**. Reconnect = new
  client (DCR) → separate Connection; no dedupe by client name (self-declared, untrusted).
- **Token → Actor** (every call): verify JWT **in-process** w/ `jose` against keys from `jwks` table
  (cached) — not the built-in `${baseURL}/jwks` self-fetch. Check sig/iss/aud/exp, then one D1 query:
  `member(userId, orgId)` for role ⋈ `oauthConsent(clientId, userId, orgId)` exists. Miss → 401.
  Revoke is instant regardless of JWT lifetime.
- **Ends**: member revokes → delete consent + mark its refresh tokens revoked (plugin doesn't).
  Member removed → `afterRemoveMember` deletes their consents for that org (live check covers it
  anyway). Org/user delete → cascade. Role change → Connection lives, new role applies. No email.
- **Lifetimes**: AT 1h, RT 30d rotating (mcp 30s reuse grace). Idle >30d → reconnect; row stays in
  table until revoked.
