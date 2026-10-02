# Profile tools: search_profiles + get_profile

Type: AFK
Status: open
Blocked by: 12

Spec: [spec.md § Tools](../spec.md)

## What to build

Extract `(actor, input)` query fns into `src/domain/queries/*`; existing server fns call them.
Tools `search_profiles` (status default active, gender, limit 25/≤100, cursor) and `get_profile`
(all cols minus org id, addresses, labelled custom fields, subject-centric `outgoing`/`incoming`
with counterpart gender). zod `outputSchema` + JSON text fallback; descriptions carry ADR 0001
worked example.

## Acceptance criteria

- [ ] existing members/profile pages unchanged behaviour (server fns use extracted fns)
- [ ] field parity with in-app view for the Actor's role
- [ ] relation lists never inverted; tests incl. sisters example
- [ ] paging/limit/status tests; cross-org id → NotFound `isError`
