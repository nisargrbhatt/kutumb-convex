# Member side: Suggest drawers + My requests

Type: AFK Status: resolved Blocked by: 12, 13

Spec: [spec.md § UI, § Query keys + badges](../spec.md)

## What to build

- Active Userless Profile detail (plain member): "Suggest edit" (whole info form incl. Custom Field
  Values, `expectedVersion`, only changed fields sent), "Suggest address" (add / edit / remove),
  "Suggest relation" (outgoing add / remove). Right drawers, react-hook-form + zod. Toast + banner
  after submit; `unchanged` → toast "No changes".
- Banners: submitter "Your change is pending" → My requests; draft "Awaiting review".
- `/my-requests` (all members): breadcrumbs, DataTable (kind, profile, status, outcome reason/note +
  reviewer, submitted); row → drawer with status, outcome alert, diff; Withdraw → confirm dialog
  ("draft will be deleted" for create). Visiting calls `markRequestsSeen`.
- Community nav: My requests with unseen-outcome badge.
- Reference: prototype variant A.

## Acceptance criteria

- [x] responsive; drawers usable on phone
- [x] browser: member suggests each kind, sees pending, admin approves (via 14 or seam), member sees
      badge → visits → badge clears
- [x] `Stale` on submit → "Profile changed, reload" toast

## Comments

- 2026-10-11 (plc-15): done. `profileEditMode` / `requestOutcome` / `submitFeedback` /
  `submitErrorFeedback` (pure, `src/domain/memberRequests.ts`, 7 tests). Submit hooks
  (info/address/relation) outcome-aware via `useNotifySubmit` + `toastSubmitError`
  (`src/queries/mutation.ts`): `requested` → "Sent for review" + `change_request_submitted {kind}`.
  Existing drawers take a `suggest` copy flag; `ProfileForm` mode `suggest`. Banners
  `ProfileRequestBanner` (draft "Awaiting review" + submitter Withdraw; member "Your change is
  pending"). `/my-requests` DataTable + drawer (outcome, stale, 14's `RequestDiff`, Withdraw
  confirm) + `markRequestsSeen`; nav item w/ unseen badge. Own draft: member edits directly.
- Fix: `src/start.ts` registers an `AppError` serialization adapter — server fn errors reached the
  client as plain `Error` (message only), so every client `isAppError` check (Stale toast, 14's
  `stale_blocked`, limit codes, loader NotFound on client nav) silently failed.
- Browser-verified (worktree D1, 127.0.0.1:3015): member suggests info/address add/edit/remove,
  relation add/remove; banner count; owner approves/rejects in Reviews; badge 2 → visit → clears;
  withdraw; Stale toast; own draft edit + withdraw; other's draft / inactive by URL → 404 (SSR +
  client nav; closes 12's unverified item); 375px no overflow.
