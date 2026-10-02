# Connect drawer + public setup guide

Type: AFK
Status: resolved
Blocked by: 15

Spec: [spec.md § AI settings UI, Setup guide](../spec.md)

## What to build

Shared client-steps data module (Claude, ChatGPT, Claude Code, Cursor: steps + snippets). Right
drawer from header action + empty-state CTA: MCP URL + copy, per-client accordion, read-only note,
"Setup guide" link. Public route `/(public)/docs/mcp`: same steps + "what the AI can see / how to
revoke".

## Acceptance criteria

- [x] drawer + page render from one data source; copy buttons work
- [x] MCP URL derived from origin, not hardcoded
- [x] docs page reachable logged out; responsive; breadcrumbs

## Resolution

- `domain/mcpClients.ts`: pure `mcpClients(url)` (Claude, ChatGPT, Claude Code, Cursor: steps + snippets) + `MCP_DOCS_PATH`. Tested. One source for drawer + page.
- MCP URL: public server fn `server/mcpInfo.ts` -> `mcpResourceUrl(env.BETTER_AUTH_URL)`; `queries/mcpInfo.ts` (staleTime Infinity).
- `ConnectAiClientDrawer` (right Sheet): URL + copy, accordion, read-only alert, "Setup guide" (new tab). `ConnectAiClientButton` now opens it (header + empty state). Shared `McpClientSteps`, `CopyButton`.
- Public `/(public)/docs/mcp`: URL, per-client steps, what AI can see, how to revoke; breadcrumbs Home › Docs › MCP. Browser-checked logged out, desktop + 375px, no overflow.
- Not run: drawer in browser (needs seeded login); real-client flow (slice 17).
