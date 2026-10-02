# MCP endpoint + whoami

Type: AFK
Status: open
Blocked by: 10

Spec: [spec.md § MCP endpoint, Tools, Rate limits & analytics](../spec.md)

## What to build

`@modelcontextprotocol/server` `^2.1` `createMcpHandler({legacy:'stateless'})` at `ANY /api/mcp`.
`verifyMcpRequest` (jose, JWKS memo from `jwks` table, 401/403 challenges). `loadConnectionActor`
(`member` ⋈ `oauthConsent` → `Actor | null`) → `authInfo.extra.actor`, typed `getActor(ctx)`.
Origin/Host checks. Error mapping (`AppError` → `isError`). CF `ratelimits` binding 60/min per
`clientId:userId` → 429. PostHog `mcp_tool_called` via `waitUntil`. Tool `whoami`.

## Acceptance criteria

- [ ] Inspector (2026-07-28 + 2025 Streamable HTTP) lists tools, calls `whoami` → correct org/role
- [ ] no token / bad aud / expired → 401 + `resource_metadata`; no Connection → 401; no scope → 403
- [ ] role change reflected next call; removed member → 401
- [ ] foreign Origin → 403; wrong Host → rejected
- [ ] tests for verify + loadConnectionActor
