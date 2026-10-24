# MCP guide: write access + new read tools

Type: AFK Status: open Blocked by: 15, 17, 20

Spec: [spec.md § Docs](../spec.md)

## What to build

Update `src/routes/(public)/docs/mcp/index.tsx`: new read tools (`list_custom_fields`,
`count_profiles`, filters), write access (choose Read and make changes, owner/admin apply vs member
requests, Make read only, reconnect to upgrade, quotas, owner toggle), example prompts.

## Acceptance criteria

- [ ] page browser-verified, responsive, breadcrumbs intact
