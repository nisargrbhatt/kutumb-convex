# Reviews page + pending badge

Type: AFK Status: ready-for-agent Blocked by: 11, 13

Spec: [spec.md § UI, § Query keys + badges](../spec.md)

## What to build

- `/reviews` route (owner/admin, `changeRequest.review`; others redirected): breadcrumbs,
  DataTable grouped by profile (profile, pending count, stale flag, kinds, oldest age), oldest
  first.
- Row → right drawer: stacked requests with kind, submitter, age, stale reason, before/after diff
  per kind, overlap warning, optional approve note, Approve (disabled when stale), Reject → reason
  dialog ("draft will be deleted" for create).
- Community nav: Reviews item with pending-count badge (`staleTime` 60s, focus refetch).
- Member detail banner for owner/admin: "N pending changes" → Reviews.
- Analytics: `stale_blocked` on `Stale` error. Reference: prototype branch
  `prototype/review-audit-ui` variant C.

## Acceptance criteria

- [ ] responsive mobile → ultrawide; drawer usable on phone
- [ ] approve/reject invalidates queue, badge, profile, audit
- [ ] browser: each of the 7 kinds' diff renders; stale request shows reason + disabled approve
