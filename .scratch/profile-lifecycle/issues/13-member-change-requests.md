# Member Change Requests: info, relation, address

Type: AFK Status: resolved Blocked by: 11

Spec: [spec.md § Mutation seam](../spec.md)

## What to build

Backend only (UI in 14/15):

- `submit` routes member changes on `active` Userless Profiles to pending requests for `info`,
  `relation_add`, `relation_remove`, `address_add`, `address_edit`, `address_remove`, with payloads
  per [data model](03-change-request-and-audit-data-model.md) + `change_request.submitted`. Many
  pending per profile allowed. Relation requests: outgoing only.
- `review` apply for each kind via the shared planner: stale rules (field ≠ base / target gone /
  counterpart not active / pair related), `Stale` blocks approve, reject always allowed; guard
  trip → re-read → `Stale` or `Conflict`. Approve = `approved` + applied event.
- `withdraw` for non-create kinds.
- Read fns for 14/15: `listPendingByProfile` (queue grouped by profile, stale flag + reason
  computed, overlap detection), `pendingCount`, `listMyRequests`, `unseenCount`,
  `markRequestsSeen`, `pendingForProfile` (banner: count for owner/admin, own for submitter).
  Server fns + `changeRequestKeys` query options.

## Acceptance criteria

- [x] seam tests: each kind submit → approve applies + events; each stale rule; two info requests
  patching the same field → approving one makes the other stale; withdraw; supersede on
  deactivate/delete
- [x] read fn tests: grouping, oldest first, unseen count resets after `markRequestsSeen`

## Comments

- 2026-10-11 (plc-13): done. Seam: `route()` → member on `active` Userless = `requested`; request
  built from the validated direct plan (payload/target/counterpart from its main event).
  `review` approve re-plans payload onto current state via the same planners after a stale
  check; reject always allowed. Guard trip → re-read: closed → `Conflict`, stale → `Stale`, else
  `Conflict` (`Plan.onGuardTrip` may be a fn). Payload types + `staleReason` / `touchedKeys` in
  `src/domain/changeRequest.ts` (pure); read fns + `loadStaleReasons` in
  `src/domain/queries/changeRequests.ts`; server fns `src/server/changeRequest.ts`; query
  options `src/queries/changeRequest.ts`. 16 seam + 7 read tests
  (`profileChanges.requests.test.ts`, `queries/changeRequests.test.ts`, harness
  `src/test/profileChangesHarness.ts`).
- Decisions: `change_request.submitted` payload `{kind, payload}`; `unseenCount` excludes
  `withdrawn`; `pendingCount` counts requests (not profiles); overlap = same info field / address /
  relation / counterpart pair. Relation-add approve has no in-batch pair guard (race accepted, as
  direct).
