# AI attribution + pending request limit

Type: AFK Status: resolved Blocked by:

Spec: [spec.md § Guardrails + attribution, § UI](../spec.md), ADR 0007

## What to build

- Migration: nullable `viaClientId`, `viaClientName` on `auditEvent` and `changeRequest`.
- `makeProfileChanges` takes optional `via {clientId, clientName}`; stamps events + requests.
  Review events stay unattributed.
- `PENDING_REQUEST_LIMIT = 50` per submitter per org (`src/lib/limits.ts`), checked in
  `makeProfileChanges` → `LimitReached` (app + MCP).
- `SubmitResult` gains new `version` + created ids (`profileId`, `addressId`, `relationId`).
- UI byline `Bot` + "via <client name>" in Reviews, profile History, My requests.

## Acceptance criteria

- [ ] seam tests: via stamped on events + request; null in-app; limit at 50; result ids/version
- [ ] app member at limit sees `LimitReached` toast
- [ ] byline renders (seed an attributed row), responsive

## Comments

- 2026-10-24: Implemented on `feat/mcp-improvements` (slice branch merged; review fixes in `fix/mcp-v2-review`, integration 83562ce). Tests/tsc/lint/build green. Browser verification: still pending (implementers skipped it to avoid dev-server clashes).
