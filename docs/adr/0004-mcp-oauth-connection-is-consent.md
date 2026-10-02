# MCP OAuth via better-auth `@better-auth/mcp`; a Connection is a consent row checked live

AI Clients authorize through better-auth's `@better-auth/mcp` (oauth-provider underneath, core
upgraded 1.6 → 1.7 for it, plus `@better-auth/cimd`). The org picked at consent is stored as the
consent's `referenceId`, and a **Connection is exactly one `oauthConsent` row** `(clientId, userId,
orgId)`. Access tokens are JWTs, but every MCP call re-checks that consent row **and** the member's
current role in D1, so revoking or removing membership takes effect immediately, not at token expiry.

- **Considered**: stay on 1.6 `oauth-provider` with DCR only (no upgrade, no CIMD) — rejected to
  follow the spec's preferred CIMD now rather than migrate later; core `mcp`/`oidc-provider`
  (removed in 1.7, no audience binding, no org hook); Agent-Auth (not OAuth, unstable); a custom
  Connection table (duplicates plugin state).
- **Consequences**: 1.7 needs an atomic rate limiter, so it moves from KV to D1. The CIMD fetcher is
  ours (the plugin's Node helper doesn't run on Workers), so SSRF protection is ours. JWTs are
  verified in-process from the `jwks` table, not via the plugin's self-fetch of `/jwks`. Deleting a
  consent doesn't revoke refresh tokens in the plugin, so our disconnect does it.
  Fetcher: manual redirects (refused), KV cache ~1h, relies on `global_fetch_strictly_public` for
  private-address blocking (Workers can't pin DNS). Consent shows the `client_id` host as the
  verified identity.
