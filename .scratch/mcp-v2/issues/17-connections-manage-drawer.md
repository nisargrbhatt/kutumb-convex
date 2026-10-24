# Connections Manage drawer + Make read only

Type: AFK Status: open Blocked by: 16

Spec: [spec.md § Write scope + gating, § UI](../spec.md)

## What to build

- Connections table client cell: Eye (+ amber Pencil) icons, "Read only" / "Read and make
  changes" subline from `oauthConsent.scopes`.
- Per-row **Manage** → right drawer: write → "Stop changes, keep reading" + **Make read only**;
  read → reconnect instructions; Revoke moved here.
- Shrink-only server fn: caller's own Connection, removes only `community:write`, succeeds if
  already read only. PostHog `connection_downgraded`. No Audit Event.

## Acceptance criteria

- [ ] fn tests: own only, idempotent, other scopes kept, tokens untouched
- [ ] after downgrade next MCP call: `canWrite:false`, `connection_read_only`
- [ ] drawer browser-verified, responsive
