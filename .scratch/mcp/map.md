Label: wayfinder:map

# MCP server for community data

## Destination

A spec at `.scratch/mcp/spec.md` plus sliced implementation tickets at `.scratch/mcp/issues/` for a
remote MCP server. AI Clients connect to it via standard MCP OAuth, and the member picks one org at
consent. Tools are read-only and run as the member's Actor. An "AI" settings section lists and
revokes Connections.

## Notes

- Domain: `CONTEXT.md` terms **Actor**, **Connection**, **AI Client**, **Community Profile**,
  **Relation**. Relation direction per ADR 0001.
- Skills to consult: `grilling` + `domain-modeling` (default), `better-auth-best-practices`,
  `better-auth-security-best-practices`, `tanstack-start-best-practices`.
- Settled at charting (2026-09-26):
  - OAuth-only in v1, no static API key.
  - Open Dynamic Client Registration, guarded by consent plus a rate limit.
  - A Connection is bound to the org picked at consent.
  - Actor role is re-checked live on every call. Any Org Member may connect. Only the member sees
    and revokes their own Connections.
  - The MCP endpoint is a route in the same Worker.
  - Tools are read-only and return raw relations. The LLM reasons over them.
- Runtime: CF Workers + D1 + KV. `orgMiddleware` already builds `actor`, which is the seam to feed
  from a token.

## Decisions so far

- [MCP authorization spec requirements](issues/01-mcp-auth-spec-requirements.md): Spec version
  2026-07-28. Required: RFC 9728 metadata, S256 PKCE, and an audience-bound `resource`. The spec
  prefers CIMD but DCR is still used by clients, so support both. Redirect matching must ignore the
  loopback port, and responses must emit `iss`.
- [better-auth plugin options for MCP OAuth](issues/02-better-auth-plugin-choice.md): Recommends
  `@better-auth/oauth-provider` plus `jwt()`, with the org stored as the consent `referenceId` and
  included as a JWT claim. Rejects `mcp`/`oidc-provider` (deprecated) and Agent-Auth (not stable).
  On core 1.7 the equivalent is `@better-auth/mcp`.
- [MCP server runtime on Workers](issues/03-mcp-server-runtime-on-workers.md): Use
  `createMcpHandler` from MCP SDK v2 in an `ANY` route at `/api/mcp`. It is stateless and needs no
  Durable Object. The Actor is passed in via `authInfo.extra`. Rejects `McpAgent` (needs a Durable
  Object and is deprecated).
- [OAuth mechanism and consent flow](issues/04-oauth-mechanism-and-consent-flow.md): Upgrade core to
  1.7.6 → `@better-auth/mcp` + `cimd` (CIMD + DCR), upgrade as its own first slice (rate limiter →
  D1). Top-level `/oauth/select-org` + `/oauth/consent`. Connection = consent row, checked live with
  role on every call; JWT verified in-process. AT 1h / RT 30d rotating. ADR 0004.
- [v1 MCP tool catalogue](issues/05-v1-tool-catalogue.md): 4 tools: `whoami`, `search_profiles`,
  `get_profile`, `get_family_graph`. Field parity with in-app view. Relations subject-centric,
  un-inverted, with counterpart gender. Extract `(actor, input)` query fns. Search 25/100 + cursor;
  graph ≤3 deep, ≤200 nodes.
- [MCP route architecture and Actor seam](issues/06-mcp-route-architecture.md): SDK v2 `^2.1`,
  `legacy:'stateless'` (≥2025-03-26). `/api/mcp` + root `.well-known` routes serving
  better-auth-built metadata (issuer `/api/auth`). Own `verifyMcpRequest` → 401/403 challenges; JWKS
  memo from D1. `loadConnectionActor` → existing `Actor` via `authInfo.extra`. `AppError` →
  `isError`. Strict Origin/Host, no CORS on MCP.
- [AI settings section UI](issues/07-ai-settings-section-ui.md): `/profile/ai` for any member.
  Connections table + "Connect AI client" drawer (URL, per-client steps, docs link). Community
  filter defaults to active org. Status Active/Expired. Consent screens prototyped; unverified
  client → red.
- [Assemble spec and implementation slices](issues/08-assemble-spec-and-slices.md): Spec written to
  `spec.md`. Last used comes from refresh tokens. Rate limits use better-auth rules plus the CF
  binding. PostHog tracks events with no PII. Setup guide is public at `/docs/mcp`. 9 slices (09–17)
  start with the better-auth upgrade.

## Not yet specified

_None. The way is clear. Implementation slices are in `issues/09`–`17`._

## Out of scope

- Write tools (create or edit profiles, add relations).
- In-app chat, where Kutumb calls an LLM itself.
- Usage metering or billing for AI access.
- Static personal API key: v1 is OAuth-only ([08](issues/08-assemble-spec-and-slices.md)).
- Admin oversight of other members' Connections, because Connections are personal
  ([08](issues/08-assemble-spec-and-slices.md)).
