# Reviews page + pending badge

Type: AFK Status: resolved Blocked by: 11, 13

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

- [x] responsive mobile → ultrawide; drawer usable on phone
- [x] approve/reject invalidates queue, badge, profile, audit
- [x] browser: each of the 7 kinds' diff renders; stale request shows reason + disabled approve

## Comments

- 2026-10-11 (plc-14): done. `/reviews` (DataTable, `?profile=` opens drawer; kinds/age fold into
  profile cell <md/<sm), `ReviewDrawer` (per-request card: diff, stale alert + disabled approve,
  overlap "#n" warning, rhf+zod approve note, reject → `RejectRequestDialog`). Shared
  `RequestDiff` / `KindBadge` / `StaleBadge` in `src/components/changeRequest/`, pure
  `requestDiff` / `requestKindLabel` (`src/domain/requestDiff.ts`, 6 tests). Nav "Reviews" +
  pending badge; owner/admin `PendingReviewBanner` on member detail → `/reviews?profile=`.
  `useReviewChangeRequest` takes optional `kind` → `stale_blocked` event carries kind.
- Browser (worktree local D1, seeded requests): approve/reject all 7 kinds, overlap → approve one
  → other stale, stale relation_add disabled, badge 10 → 2, mobile 375.
- Diff header "Before" (= request base, not live value). `staleReasonText` prints raw keys
  (`nickName`, `customFieldData.<id>`): left as-is (shared w/ 15).
