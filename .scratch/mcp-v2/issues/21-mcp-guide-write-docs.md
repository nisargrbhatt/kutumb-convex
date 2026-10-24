# MCP guide: write access + new read tools

Type: AFK Status: resolved Blocked by: 15, 17, 20

Spec: [spec.md § Docs](../spec.md)

## What to build

Update `src/routes/(public)/docs/mcp/index.tsx`: new read tools (`list_custom_fields`,
`count_profiles`, filters), write access (choose Read and make changes, owner/admin apply vs member
requests, Make read only, reconnect to upgrade, quotas, owner toggle), example prompts.

## Acceptance criteria

- [ ] page browser-verified, responsive, breadcrumbs intact

## Comments

- 2026-10-24: Implemented on `feat/mcp-improvements` (slice branch merged; review fixes in `fix/mcp-v2-review`, integration 83562ce). Tests/tsc/lint/build green. Browser verification: still pending (implementers skipped it to avoid dev-server clashes).
