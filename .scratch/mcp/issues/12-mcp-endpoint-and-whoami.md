# MCP endpoint + whoami

Type: AFK Status: done Blocked by: 10

Spec: [spec.md § MCP endpoint, Tools, Rate limits & analytics](../spec.md)

## What to build

`@modelcontextprotocol/server` `^2.1` `createMcpHandler({legacy:'stateless'})` at `ANY /api/mcp`.
`verifyMcpRequest` (jose, JWKS memo from `jwks` table, 401/403 challenges). `loadConnectionActor`
(`member` ⋈ `oauthConsent` → `Actor | null`) → `authInfo.extra.actor`, typed `getActor(ctx)`.
Origin/Host checks. Error mapping (`AppError` → `isError`). CF `ratelimits` binding 60/min per
`clientId:userId` → 429. PostHog `mcp_tool_called` via `waitUntil`. Tool `whoami`.

## Acceptance criteria

- [x] Inspector (2026-07-28 + 2025 Streamable HTTP) lists tools, calls `whoami` → correct org/role
      (verified with curl + real OAuth token, both eras; real Inspector deferred to 17)
- [x] no token / bad aud / expired → 401 + `resource_metadata`; no Connection → 401; no scope → 403
- [x] role change reflected next call; removed member → 401
- [x] foreign Origin → 403; wrong Host → rejected
- [x] tests for verify + loadConnectionActor

## Resolution

- Deps: `@modelcontextprotocol/server` ^2.1 (2.2.0), `jose` ^6 (direct; was transitive).
- `src/domain/mcpEndpoint.ts` (pure: bearer parse, challenge, Origin/Host check, `parseRole`),
  `src/server/mcp/{verify,actor,endpoint,errors,server,runtime}.ts`, `tools/{define,whoami}.ts`,
  route `src/routes/api/mcp.ts` (`ANY`). `endpoint.ts` orchestrates: Origin/Host → verify → rate
  limit → handler; `runtime.ts` is the only file touching `cloudflare:workers`/D1 (rest is injected,
  hence testable).
- Verify: `jose` + `jwks` table → JWKS (row id = `kid`, `alg` null → EdDSA), memo 10 min TTL,
  refetch on unknown `kid` w/ 10s cooldown (so junk tokens can't hammer D1). Requires `exp`. Claims:
  `sub` user, `azp` client, `org_id`, `scope`. Scope checked before Connection lookup. Key-load D1
  failure → 5xx, not 401.
- `loadConnectionActor(db, key)`: one drizzle query `member` ⋈ `oauth_consent`; multi-role strings
  ("member,admin") resolve to most privileged; unknown role → null (401).
- Rate limit: CF binding `MCP_RATE_LIMITER` (`ratelimits`, 60/60s, namespace_id `1001` arbitrary),
  key `clientId:userId`, 429 + `Retry-After: 60` (const must track wrangler period). `cf-typegen`
  rerun.
- `defineReadTool` (input-less for now; slice 13 adds input schemas): maps errors, emits
  `mcp_tool_called` (`captureMcpToolCalled`, waitUntil flush).
- Tests: `mcpEndpoint`, `verify` (every 401/403 + challenge, JWKS memo/rotation), `actor` (real
  migrations replayed in node:sqlite), `endpoint`, `errors`, `server` (SDK handler, 2025 stateless).
- Verified live on dev (throwaway user, real DCR→authorize→consent→token): 2025 `initialize`/
  `tools/list`/`tools/call whoami` and 2026-07-28 (`Mcp-Method` header + `_meta` envelope) both
  return org/role; role UPDATE → next call new role; consent deleted → 401; no token/bad token 401
  w/ challenge; foreign Origin 403; wrong Host 403; PRM ok. Not run: real MCP Inspector (slice 17),
  removed-member over HTTP (unit-covered), 429 over HTTP (unit-covered).

Known limits:

- Host must equal `BETTER_AUTH_URL` host: `*.workers.dev` alias (workers_dev=true) is refused.
- `ratelimits` counters are per-location, eventually consistent (CF design).
- Tool errors from `getActor` (no Actor) / zod input errors skip `mcp_tool_called`.
