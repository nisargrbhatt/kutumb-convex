# Spec: MCP server for community data

Status: ready for implementation (2026-10-02). Map: [map.md](map.md). Slices: `issues/09`–`17`.

## Problem

Org Members want to ask an LLM about their community ("who are Jared's sisters?", "list members in
Pune") from the AI Client they already use (Claude, ChatGPT, Claude Code, Cursor). Today the only way
to do that is copying data out by hand. Kutumb has no API an AI Client can call, and no way for a
member to grant or revoke that access safely.

## Solution

A remote MCP server at `${origin}/api/mcp`, served by the same Worker. AI Clients connect with
standard MCP OAuth (CIMD preferred, DCR as fallback). At consent the member picks **one** org. The
result is a **Connection**, meaning one consent row, and every tool call runs as that member's
**Actor** with their **current** role in that org. Tools are read-only. A new **Profile → AI** page
lists the member's Connections and lets them revoke any of them. A public setup guide explains how to
connect each client.

Terms (`CONTEXT.md`): **Actor**, **Connection**, **AI Client**, **Community Profile**, **Relation**
(direction per ADR 0001). ADR 0004 records the auth decision.

## User stories

**Org Member**
- Add the Kutumb MCP URL to my AI Client, sign in with my Kutumb account, pick a community, review
  what the client is asking for, then Allow or Deny.
- See whether the AI Client is verified (CIMD, shown with a tick and its host) or unverified (DCR,
  shown with a red warning).
- Ask my AI Client about profiles, relations and the family tree, and get exactly what I can see in
  the app.
- See all my Connections (client, community, connected date, last used, status) and filter them by
  community. The filter defaults to the active org.
- Revoke a Connection, after which the client loses access immediately.
- Find copyable setup steps for each client in a drawer and on a public guide page.

**AI Client**
- Discover the authorization server through RFC 9728 metadata after receiving a 401, register (CIMD
  or DCR), and run auth code + PKCE S256 with a `resource`. Receive a 1h JWT access token and a 30d
  rotating refresh token.
- Call `whoami`, `search_profiles`, `get_profile` and `get_family_graph` using either the 2026-07-28
  stateless protocol or the 2025-03-26+ Streamable HTTP protocol.

**Ex-member / downgraded member**
- When removed from the org, every Connection to that org stops working on the next call and the
  consent rows are deleted.
- When my role changes, the Connection survives and the new role applies on the next call.

## Implementation decisions

### Auth stack ([04](issues/04-oauth-mechanism-and-consent-flow.md), [02](issues/02-better-auth-plugin-choice.md), [01](issues/01-mcp-auth-spec-requirements.md))

- Upgrade better-auth core from 1.6.29 to **1.7.6** as its own slice. Because 1.7 requires an atomic
  limiter, the rate limiter moves from KV to a **D1** `rate_limit` table
  (`INSERT … ON CONFLICT DO UPDATE … RETURNING`), and the KV shim is removed. Re-verify the
  `requireLocalEmailVerified` default and startup schema validation.
- Plugins: `@better-auth/mcp` (oauth-provider underneath), `@better-auth/cimd` and `jwt()`. Both DCR
  flags are on (`allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration`).
- Scopes: `community:read` and `offline_access`. Lifetimes: AT 1h, RT 30d, rotating (30s reuse
  grace).
- The org is stored as the consent `referenceId`, set from the active org after select-org, and is
  emitted as a JWT claim through `customAccessTokenClaims`.
- **Connection = one `oauthConsent` row `(clientId, userId, referenceId=orgId)`.** Reconnecting
  creates a new client and therefore a separate Connection. There is no dedupe by client name,
  because the name is self-declared.
- **CIMD fetcher (ours)**: https only. Reject our own origin and IP-literal hosts. Do not follow
  redirects. 5s timeout, 64KB cap. The JSON `client_id` must equal the URL. Cache in KV for about 1h.
  There is no host allowlist; consent is the gate.
- The AS emits `iss` and advertises `authorization_response_iss_parameter_supported`. Redirect
  matching ignores the loopback port for `localhost`/`127.0.0.1`.
- **Ending a Connection**: on revoke, our server fn deletes the consent **and** marks its
  `oauthRefreshToken` rows revoked, because the plugin does not. `afterRemoveMember` deletes that
  user's consents for the org. Deleting an org or user cascades. No emails are sent.

### OAuth screens ([04](issues/04-oauth-mechanism-and-consent-flow.md), [07](issues/07-ai-settings-section-ui.md))

- Top-level routes `/oauth/select-org` (`postLogin.page`) and `/oauth/consent` (`consentPage`). Each
  has its own session gate and is not under `_authed`. Both use `AuthCardShell`. `loginPage` is the
  existing `/login`, which returns to the authorize URL.
- **select-org**: radio list (name, slug, role badge) with the active org preselected,
  Cancel/Continue, and a "signed in as" footer. Choosing an org calls `organization.setActive`, which
  also switches the web session's active org (accepted). With 0 orgs: a "No community yet" card
  linking to `/onboarding/create`, and the flow ends.
- **consent**: "Allow <client>?". CIMD clients get a verified tick and their host; DCR clients get a
  red destructive "Unverified app" alert. Shows the chosen org card with role and a "Change" link
  back to select-org. Three bullets: reads data you can see; acts as you with your current role;
  stays until revoked or 30d idle. Deny/Allow buttons. Footer: "Revoke any time in Profile → AI".
- Prototype markup: branch `prototype/mcp-ai-settings` @ d92e229 (`/oauth-prototype?screen=…`).

### MCP endpoint ([06](issues/06-mcp-route-architecture.md), [03](issues/03-mcp-server-runtime-on-workers.md))

- `@modelcontextprotocol/server` `^2.1`, `createMcpHandler` with `legacy:'stateless'`. No Durable
  Object, no SSE transport, no sessions. Mounted as `ANY` at `src/routes/api/mcp.ts`.
- **Metadata routes** (root TanStack routes, ACAO `*`, no credentials):
  - `/.well-known/oauth-protected-resource/api/mcp`, plus a root `/.well-known/oauth-protected-resource`
    alias, built from `getProtectedResourceMetadata`: `resource` = `${origin}/api/mcp`,
    `scopes_supported: ["community:read"]`.
  - `/.well-known/oauth-authorization-server/api/auth` and
    `/.well-known/openid-configuration/api/auth`, built from `oauthProviderAuthServerMetadata(auth)`.
    The issuer stays `${origin}/api/auth`.
- **`verifyMcpRequest(request)` → `{ actor, clientId, scopes } | Response`** runs before the
  handler. It verifies the JWT with `jose` against keys from the `jwks` table: module memo,
  `createLocalJWKSet`, 10 min TTL, refetch on an unknown `kid`. It checks sig, `iss`, `aud`
  (= MCP URL) and `exp`.
  - Bad or missing token, or no Connection/membership → 401 + `WWW-Authenticate: Bearer
    resource_metadata="…/.well-known/oauth-protected-resource/api/mcp", scope="community:read"`.
  - No `community:read` → 403 `insufficient_scope`.
- **`loadConnectionActor({ userId, clientId, orgId })`** = one D1 query, `member` ⋈ `oauthConsent`,
  returning `Actor | null`. It reuses `Actor` from `src/domain/permission.ts`. `orgMiddleware` is
  unchanged. The Actor is passed through `authInfo.extra.actor` and read by tools with a typed
  `getActor(ctx)`.
- **Errors**: `AppError` NotFound/Forbidden → `isError: true` + short text. Zod input errors use the
  SDK default. Unknown errors → `isError` "Internal error", with detail sent only to `console.error`.
- **Origin/Host**: an `Origin` that is present and isn't ours → 403; a missing `Origin` is allowed.
  `Host` must match `BETTER_AUTH_URL`. No CORS on `/api/mcp`.
- Files: `src/server/mcp/{verify,actor,server}.ts`, `src/server/mcp/tools/*.ts`,
  `src/routes/[.]well-known/…`.

### Tools ([05](issues/05-v1-tool-catalogue.md))

All tools are read-only (`readOnlyHint: true`) and return `structuredContent` + zod `outputSchema`
plus a JSON `text` fallback. Ids are stable for chaining.

- `whoami` → `{ userId, organization: {id, name}, role, profileId | null }`.
- `search_profiles({ query?, status? = "active", gender?, limit? = 25 (≤100), cursor? })` →
  `{ items: [{ id, fullName, nickName, gender, status }], nextCursor | null }`.
- `get_profile({ id })` → every column except the org id, plus `addresses`, custom fields labelled
  `[{ id, label, type, value }]`, `outgoing` and `incoming`.
  - Relations are subject-centric and never inverted. `outgoing[{ type, counterpart: {id, fullName,
    gender, status} }]` means "counterpart is subject's `<type>`"; `incoming` means "subject is
    counterpart's `<type>`". The tool description carries the sisters worked example.
- `get_family_graph({ focusId?, depth? = 2 (≤3) })` → `{ nodes, edges: [{fromId,toId,type}],
  truncated }`, capped at 200 nodes, built on the KV graph blob (`extractSubgraph`). If `focusId` is omitted it
  defaults to the caller's own profile, or returns an `isError` asking for a `focusId` when the
  caller has none (assumed; confirm). The description
  states "`to` is `from`'s `<type>`".
- **Field exposure** matches the Actor's in-app view (email, mobile, DOB, addresses, comment, custom
  fields). `get_profile` and the graph return profiles of any status.
- **Domain reuse**: extract plain `(actor, input)` query fns (`src/domain/queries/*`) that both the
  existing server fns and the tools call. Tools never touch `createServerFn`.

### AI settings UI ([07](issues/07-ai-settings-section-ui.md))

- `/profile/ai`, with an "AI" item in the Profile nav, available to any member. Breadcrumb: Home ›
  Profile › AI.
- The Connections table is the page. Columns: AI Client (name + host), Community (hidden below `sm`
  and folded into the client cell), Connected (date), Last used (relative), Status, Revoke.
  - **Last used** = the newest `oauthRefreshToken.createdAt` for the Connection, accurate to about
    1h. No per-call writes. "Never" if there has been no refresh.
  - **Status**: Active / Expired (no refresh in more than 30d).
  - **Revoke**: icon → `ConfirmDialog` ("<client> loses access to <org> immediately; reconnect from
    the client").
- Community filter above the table, defaulting to the active org, with an "All communities" option.
- Header action "Connect AI client" → right drawer containing: the MCP URL with a copy button, a
  per-client accordion (Claude, ChatGPT, Claude Code, Cursor) with steps and copyable snippets, a
  read-only note, and a "Setup guide" link (new tab).
- Empty state: shadcn `Empty` with the same CTA.

### Rate limits & analytics (this ticket: [08](issues/08-assemble-spec-and-slices.md))

- better-auth `customRules` (D1 limiter): `/oauth2/register` 5/h per IP, `/oauth2/token` 30/min,
  `/oauth2/authorize` 30/min.
- `/api/mcp`: Cloudflare Workers Rate Limiting binding (`ratelimits` in wrangler), keyed by
  `clientId:userId`, 60/min, returning 429 + `Retry-After`. It runs after `verifyMcpRequest`.
- PostHog (server, `distinctId = userId`, flushed via `ctx.waitUntil`). Tool inputs and outputs are
  **never** sent.
  - `mcp_tool_called { tool, orgId, clientId, isError, durationMs }`
  - `mcp_connection_created { orgId, clientId, registration: "cimd" | "dcr" }`, sent on Allow
  - `mcp_connection_revoked { orgId, clientId }`

### Setup guide (this ticket)

- A public route `/(public)/docs/mcp` with the per-client steps and a short "what the AI can see /
  how to revoke" section. Client steps live in one data module shared with the drawer.

## Testing

vitest, following the existing `src/domain/*.test.ts` style, with pure functions tested at the seam:

- `(actor, input)` query fns: org scoping, status filter, cursor paging, limit clamp.
- `get_profile` relation output: outgoing/incoming are never inverted, and the counterpart's gender
  is present.
- Graph: depth clamp, 200-node cap, `truncated`.
- `verifyMcpRequest`: each 401/403 path and the challenge header (signed with a test JWKS).
- `loadConnectionActor`: no consent → null, no membership → null, role change → new role.
- CIMD fetcher guards: http, IP literal, own origin, redirect, oversize, `client_id` mismatch.
- D1 rate limiter `consume()` atomicity and window reset (replaces `rate-limit-kv.test.ts`).
- Revoke: the consent is deleted and its RTs are revoked.

Manual E2E (slice 17): connect claude.ai, ChatGPT, Claude Code and Cursor over a `cloudflared` tunnel,
with `BETTER_AUTH_URL` set to the tunnel host (there is no staging Worker).

## Out of scope

- Write tools; in-app chat; usage metering or billing.
- A static personal API key (v1 is OAuth-only).
- Admin oversight of other members' Connections (Connections are personal).
- Memories in tools; browser-based MCP clients (no CORS on `/api/mcp`); field-level visibility.
