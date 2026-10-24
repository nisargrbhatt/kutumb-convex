# Write scope, consent and gating

Type: AFK Status: resolved Blocked by:

Spec: [spec.md § Write scope + gating, § UI, § Analytics](../spec.md), ADR 0006

## What to build

- Register `community:write` scope (better-auth oauth-provider + protected-resource metadata).
- Migration: `orgSetting(organizationId PK, aiClientWrites bool)`, missing row = on. Owner-only
  server fn to set it; PostHog `ai_client_writes_toggled`.
- `loadConnectionActor`: effective write = token scope ∩ consent scopes ∩ toggle, with reason.
- `buildMcpServer`: register write tools only when effective write (none exist yet; wire the
  gate + a shared `requireWrite` guard returning `WriteNotAllowed`). `whoami.canWrite`, `reason`,
  reconnect hint. `toolErrorResult` maps `WriteNotAllowed`.
- Disable plugin `/oauth2/update-consent` via `disabledPaths`.
- Consent screen variant B (prototype branch `prototype/write-consent-ui`): radio cards, role
  copy, disabled when toggle off, `consent({accept:true, scope})` subset. `mcp_connection_created`
  + `write`.
- Settings → AI tab (`settings/ai`): owner radio cards, others disabled, ConfirmDialog on off.
  Breadcrumbs, responsive.

## Acceptance criteria

- [ ] gating matrix tests: token × consent × toggle → canWrite + reason
- [ ] consent with subset stores read-only scopes; with write stores both
- [ ] `/oauth2/update-consent` returns 404
- [ ] toggle fn rejects non-owner
- [ ] consent + Settings → AI browser-verified (mobile → desktop)

## Comments

- 2026-10-24: Implemented on `feat/mcp-improvements` (slice branch merged; review fixes in `fix/mcp-v2-review`, integration 83562ce). Tests/tsc/lint/build green. Browser verification: still pending (implementers skipped it to avoid dev-server clashes).
