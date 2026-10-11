# Mutation seam: direct apply + audit + lifecycle

Type: AFK Status: resolved Blocked by: 08, 09

Spec: [spec.md § Mutation seam, § Audit emission, § UI Lifecycle](../spec.md)

## What to build

`makeProfileChanges` (`src/domain/profileChanges.ts`, wired `src/lib/profileChanges.ts`) per
[Profile mutation seam](04-profile-mutation-seam.md), **direct paths only** in this slice:

- `submit` for all 7 kinds where routing says direct: linked self-edit (info, relations,
  addresses), owner/admin on any Userless Profile, creator + owner/admin on `draft`. Member on
  `active` Userless → `Forbidden` for now (requests land in 13). Owner/admin create → `active`.
  Member create keeps today's `draft` behaviour but via `submit` (request row comes in 11).
- `reassign`, `deactivate`, `reactivate`, `remove` (owner) with supersede of pending requests
  (backfilled create requests included).
- Private planner → batch statements + Audit Events; `version` bumps; `expectedVersion` → `Stale`;
  empty diff → `unchanged`; guard technique from slice 08.
- `AppErrorKind` += `Stale`, `Conflict`, `Invalid`; relation code's plain `Error`s → `Invalid`.
- Rewire server fns: one thin fn per kind taking `profileId`; collapse "My…" / "…ToProfile"
  pairs; new delete/deactivate/reactivate + owner/admin info/address fns. Retire
  `communityProfile.manageRelations`.
- UI: owner/admin info + address edit drawers on Userless Profile detail; "⋯" menu (Deactivate /
  Reactivate, Delete owner-only) with confirm dialogs warning "N pending requests will be
  superseded". Own profile pages call new fns.
- Query keys: add `auditKeys`; mutations invalidate `profileKeys.all`, `auditKeys.all`
  (`changeRequestKeys` once it exists in 11).
- Analytics: `profile_deactivated`, `profile_reactivated`, `profile_deleted`; `profile_saved` /
  `member_added` `{outcome}`.

## Acceptance criteria

- [x] seam tests via `freshDb` + batch callback: every direct routing cell, events per emission
  rule (diff vs snapshot, cascade `relation.removed`, no-op → no event), rollback on guard trip
  leaves no partial rows, `Stale` on version mismatch, `onGraphChanged` only on
  status/name/relation change (as built: any graph-held field, active only; spec updated)
- [x] existing own-profile, relation, address, reassign, add-member flows unchanged in browser
- [x] new drawers + "⋯" menu responsive, breadcrumbs intact

## Comments

- 2026-10-10 (plc-10): done. Seam `src/domain/profileChanges.ts` (+ wiring `src/lib/profileChanges.ts`),
  38 seam tests (`freshDb` now has a BEGIN/COMMIT/ROLLBACK batch callback). Server fns collapsed:
  `createProfile`, `updateProfileInfo`, `addRelation`/`removeRelation`, `addAddress`/`editAddress`/
  `removeAddress`, `reassignProfile`, `deactivateProfile`/`reactivateProfile`/`deleteProfile`,
  `getPendingRequestCount`. `manageRelations` retired. Browser-verified on local workerd D1
  (owner: self create/edit, add member → active, edit drawer, address add/edit/delete, relation
  add, ⋯ deactivate w/ supersede warning / reactivate / delete; mobile width).
- Deviations: `onGraphChanged` fires on any graph-blob field change (blob caches email/mobile/DOB
  etc., not only name), only for `active` profiles. Accept/reject untouched (ticket 11), so they
  still write no audit / no version bump. Member draft create writes no event yet (11 adds
  request + `change_request.submitted`). Address/relation writes don't bump profile `version`.
- Acceptance ticked in review fix: tests + browser checks per plc-10 comment above.
