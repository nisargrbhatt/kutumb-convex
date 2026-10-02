# MCP route architecture and Actor seam

Type: grilling Status: resolved Blocked by: 03, 04

## Question

How is the MCP endpoint wired?

- route path(s): the MCP endpoint plus the `.well-known` metadata routes
- where the token is verified
- how the verified token produces the same `actor` that `orgMiddleware` produces
- how tools call domain code without a cookie session
- error mapping (`AppError` → MCP errors)

Also, from ticket 01: the 2026-07-28 transport is stateless, with no initialize and no session
header. How far back should we support older protocol versions?

Also, from ticket 03:

- Can we rely on the SDK v2 stateless fallback, or should we reject 2025 clients with
  `legacy:'reject'`?
- Pin 2.0 or 2.1?
- Bearer auth has its own verifier. Don't reuse the cookie `authMiddleware`.
- Add an Origin/Host check.
- Who emits the 401 challenge and the RFC 9728 metadata: better-auth or `withMcpAuth`?

Also, from ticket 04:

- JWT verified in-process with `jose` from the `jwks` table, not `requireMcpAuth`'s `/jwks`
  self-fetch. Then one D1 query: member role ⋈ consent exists. So the 401 challenge is ours;
  `@better-auth/mcp` may still serve the RFC 9728 metadata via `onRequest`. Decide the split.

## Answer

Grilled 2026-09-26. No ADR (reversible, unsurprising).

- **SDK**: `@modelcontextprotocol/server` `^2.1` (check changelog at install). `createMcpHandler`
  with `legacy:'stateless'`: serves 2026-07-28 + stateless fallback back to 2025-03-26 (Streamable
  HTTP). No SSE transport.
- **Routes**: MCP at `/api/mcp` (`ANY`). Issuer stays better-auth `${origin}/api/auth`.
  better-auth's `onRequest` can't see root paths, so root TanStack routes serve metadata JSON built
  by better-auth:
  - `/.well-known/oauth-protected-resource/api/mcp` + root `/.well-known/oauth-protected-resource`
    alias → `oauthProviderResourceClient(...).getProtectedResourceMetadata`, `resource` =
    `${origin}/api/mcp`, `scopes_supported: ["community:read"]` (no `offline_access`).
  - `/.well-known/oauth-authorization-server/api/auth` +
    `/.well-known/openid-configuration/api/auth` → `oauthProviderAuthServerMetadata(auth)`.
- **Verify** (ours, not `requireMcpAuth`/`withMcpAuth`): `verifyMcpRequest(request)` →
  `{ actor, clientId, scopes } | Response`, runs before MCP handler.
  - missing/bad/expired JWT, bad `aud`/`iss` → 401 +
    `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/api/mcp", scope="community:read"`.
  - valid JWT but no consent/membership → 401 (client re-auths).
  - no `community:read` → 403 `insufficient_scope`.
- **JWKS**: keys from `jwks` table, module-level memo per isolate (`jose` `createLocalJWKSet`), 10
  min TTL, refetch on unknown `kid`. No KV.
- **Actor seam**: reuse `Actor` (`src/domain/permission.ts`). Separate builder
  `loadConnectionActor({ userId, clientId, orgId })` = one D1 query `member` ⋈ `oauthConsent` →
  `Actor | null`. `orgMiddleware` unchanged. Pass via
  `handler.fetch(req, { authInfo: { token, clientId, scopes, extra: { actor } } })`; tools use typed
  `getActor(ctx)` and call `(actor, input)` query fns (ticket 05). No `createServerFn`, no headers
  in tools.
- **Errors**: `AppError` NotFound/Forbidden → tool result `isError: true` + short text. Zod input →
  SDK default. Unknown → `isError` "Internal error", detail to `console.error` only. NoActiveOrg /
  LimitReached unreachable.
- **Origin/Host**: `/api/mcp`: `Origin` present and ≠ ours → 403; absent → allow. `Host` must match
  `BETTER_AUTH_URL`. No CORS on `/api/mcp` (browser clients unsupported in v1). Metadata routes:
  ACAO `*`, no credentials.
- **Files**: `src/routes/api/mcp.ts` (thin), `src/server/mcp/{verify,actor,server}.ts`,
  `src/server/mcp/tools/*.ts`, `src/routes/[.]well-known/…`.
