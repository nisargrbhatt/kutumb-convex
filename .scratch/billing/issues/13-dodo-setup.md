# Dodo dashboard and env setup (Test Mode)

Status: resolved Blocked by:

## What to build

Nothing in code. User runs the Test Mode setup checklist so webhook + checkout work end to end
locally.

## Spec

[spec.md](../spec.md): Setup checklist (user) → Test Mode.

## Done when

- [x] Product, Subscriptions, Recovery, Email toggles set as listed.
- [x] Test webhook endpoint created (tunnel URL), 11 events subscribed.
- [x] `.dev.vars` has the four `DODO_*` values; `PROBE_EMAIL` removed.
