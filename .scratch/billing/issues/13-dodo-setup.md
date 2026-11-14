# Dodo dashboard and env setup (Test Mode)

Status: ready-for-human Blocked by:

## What to build

Nothing in code. User runs the Test Mode setup checklist so webhook + checkout work end to end
locally.

## Spec

[spec.md](../spec.md): Setup checklist (user) → Test Mode.

## Done when

- [ ] Product, Subscriptions, Recovery, Email toggles set as listed.
- [ ] Test webhook endpoint created (tunnel URL), 11 events subscribed.
- [ ] `.dev.vars` has the four `DODO_*` values; `PROBE_EMAIL` removed.
