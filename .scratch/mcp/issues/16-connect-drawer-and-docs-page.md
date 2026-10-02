# Connect drawer + public setup guide

Type: AFK
Status: open
Blocked by: 15

Spec: [spec.md § AI settings UI, Setup guide](../spec.md)

## What to build

Shared client-steps data module (Claude, ChatGPT, Claude Code, Cursor: steps + snippets). Right
drawer from header action + empty-state CTA: MCP URL + copy, per-client accordion, read-only note,
"Setup guide" link. Public route `/(public)/docs/mcp`: same steps + "what the AI can see / how to
revoke".

## Acceptance criteria

- [ ] drawer + page render from one data source; copy buttons work
- [ ] MCP URL derived from origin, not hardcoded
- [ ] docs page reachable logged out; responsive; breadcrumbs
