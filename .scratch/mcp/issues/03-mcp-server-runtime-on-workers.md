# MCP server runtime on Workers

Type: research
Status: resolved
Blocked by:

## Question

How should an MCP server run as a route inside this TanStack Start app on CF Workers? Options:
- `@modelcontextprotocol/sdk` Streamable HTTP, stateless
- Cloudflare `agents` / `McpAgent` (Durable Object)
- `mcp-handler`

For each, cover:
- whether it can run stateless with no Durable Object
- how it mounts on a TanStack Start server route
- how it takes a pre-verified auth context
- bundle size and Workers compatibility

## Answer

- MCP TS SDK v2 (`@modelcontextprotocol/server` 2.x, stable) ships own `createMcpHandler(factory)` → web-standard `{ fetch }`, stateless, per-request server; serves 2026-07-28 spec + stateless 2025 fallback. `agents` + `mcp-handler` 2.x now thin wrappers over it.
- **v1 `@modelcontextprotocol/sdk` WebStandardStreamableHTTPServerTransport**: stateless OK (`sessionIdGenerator: undefined`, new transport per req). Auth via `handleRequest(req,{authInfo})` → `extra.authInfo`. Must swap ajv for `CfWorkerJsonSchemaValidator` on Workers. ~66 KB gz. 2025 spec only → legacy.
- **v2 `createMcpHandler`**: no DO. Mount `handler.fetch(request,{authInfo})` in server route. authInfo pass-through (no verification) → factory `ctx.authInfo` + tool `ctx.http.authInfo`; put `{userId, orgId, role}` in `AuthInfo.extra`. `workerd` export cond auto-picks cfworker validator. ~53 KB gz. Add Origin/Host check (SDK helpers).
- **CF `agents`**: `McpAgent` = DO, deprecated/feature-frozen, ~270 KB gz → reject. `agents/mcp/server` `createMcpHandler` = v2 + CORS/host/origin checks + `getMcpAuthContext()` (ALS); `route` exact-path (default `/mcp`, else 404). ~55 KB gz.
- **`mcp-handler` 2.x**: stateless, path-agnostic `(req)=>Response`. `withMcpAuth` → RFC 9728 401/403 challenges, sets `req.auth` → `ctx.http.authInfo`; `protectedResourceHandler`. ~55 KB gz.
- TanStack mount: `createFileRoute("/api/mcp")({ server: { handlers: { ANY: ... } } })` (`ANY` supported in start-server-core). Don't reuse `authMiddleware` (cookie + redirect); MCP needs bearer → 401. Default CSRF mw only hits serverFn.
- Streaming: `responseMode: 'auto'` → JSON unless progress/log emitted then SSE; Workers stream fine. Stateless → no GET stream (405), no sessions; state lives in D1/KV.
- **Recommendation:** v2 `@modelcontextprotocol/server` `createMcpHandler` direct, `src/routes/api/mcp.ts` `ANY` handler, own bearer verification (better-auth) → `authInfo`. No DO, no wrangler change. Use `mcp-handler` `withMcpAuth` only if better-auth lacks 401 challenge / protected-resource metadata.

Full findings: branch research/mcp-runtime-workers, .scratch/mcp/research/03-mcp-server-runtime-on-workers.md
