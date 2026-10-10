# Member Change Requests: info, relation, address

Type: AFK Status: ready-for-agent Blocked by: 11

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

- [ ] seam tests: each kind submit → approve applies + events; each stale rule; two info requests
  patching the same field → approving one makes the other stale; withdraw; supersede on
  deactivate/delete
- [ ] read fn tests: grouping, oldest first, unseen count resets after `markRequestsSeen`
