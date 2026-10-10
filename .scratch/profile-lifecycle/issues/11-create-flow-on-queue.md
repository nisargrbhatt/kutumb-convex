# Create flow on the queue

Type: AFK Status: ready-for-agent Blocked by: 10

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

- [ ] seam tests: create request lifecycle (approve / reject / withdraw / supersede via reassign &
  delete), backfilled request (null submitter) reviewable, double review → `Conflict`
- [ ] Member limit freed after reject/withdraw (test)
- [ ] browser: member creates draft, admin approves/rejects from detail page
