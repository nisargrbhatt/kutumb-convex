# Create flow on the queue

Type: AFK Status: resolved Blocked by: 10

Spec: [spec.md § Mutation seam, § Audit emission](../spec.md)

## What to build

- Member create via `submit` → `draft` + pending `create` Change Request +
  `change_request.submitted` (one batch); Member-limit check first.
- `review` for `create`: approve → `active` + `change_request.approved` (note) +
  `profile.activated`; reject (reason required) → hard-delete + `rejected` + `profile.deleted`
  (snapshot), slot freed. Guard on `status='pending'` → `Conflict` when already closed.
- `withdraw` for `create` (submitter only): hard-delete + `withdrawn` + `profile.deleted`.
- Existing accept/reject buttons on member detail call `review`; reject opens reason dialog.
  Retire `acceptCommunityProfile` / `rejectCommunityProfile`, `communityProfile.approve/reject`.
- Add `changeRequestKeys` to `src/queries/keys.ts`; mutations invalidate it.
- Analytics: `change_request_submitted {kind}`, `change_request_reviewed {kind, decision}`,
  `change_request_withdrawn {kind}`; retire `member_profile_accepted/rejected`.

## Acceptance criteria

- [x] seam tests: create request lifecycle (approve / reject / withdraw / supersede via reassign &
  delete), backfilled request (null submitter) reviewable, double review → `Conflict`
- [x] Member limit freed after reject/withdraw (test)
- [x] browser: member creates draft, admin approves/rejects from detail page

## Comments

- 2026-10-10 (plc-11): done. Seam: member create → `requested` (draft + pending create CR +
  `change_request.submitted {kind, profile}`); `review(actor, id, {decision, note})` (create only;
  other kinds → `Invalid` until 13) and `withdraw(actor, id)` (generic close; create also deletes
  draft); both return `{kind, profileId}`. `remove` refactored onto shared `planDelete`. 8 new seam
  tests. Server fns `src/server/changeRequest.ts` (`reviewChangeRequest`, `withdrawChangeRequest`,
  `getPendingCreateRequest`); hooks `src/queries/changeRequest.ts`; reusable
  `RejectRequestDialog`. Old accept/reject fns + hooks, `communityProfile.approve/reject`,
  `member_profile_accepted/rejected` retired. `keys.ts` untouched (already had
  `changeRequestKeys`). Browser-verified on worktree local D1: member adds 2 drafts; owner accepts
  one (→ active), rejects other w/ reason (empty reason blocked; draft deleted, redirect to list).
- "Supersede via reassign" N/A for create: reassign of a draft is `Invalid` per 04; tested that the
  create CR stays pending. Delete supersede tested.
