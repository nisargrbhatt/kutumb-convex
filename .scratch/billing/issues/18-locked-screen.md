# Lock screen and client signal

Status: ready-for-agent Blocked by: 17, 19

## What to build

`/locked` route (outside `_community`), `_community` gate redirect, reverse redirect when unlocked.
Owner vs member variants, Transfer / Delete dialogs, Leave, org switcher, create org, sign out.
Global Query/mutation `onError` on `Locked` → `router.invalidate()`. `?from=dodo` confirm-payment
state.

## Spec

[spec.md](../spec.md): Lock enforcement (route gate, client signal), UI → Lock screen.

## Done when

- [ ] Each `lockReason` × owner/member matches prototype copy; responsive.
- [ ] Lock starting mid-session lands on `/locked` after next query.
- [ ] Owner pays from `/locked` → returns → dashboard without manual refresh (≤30s).
- [ ] canceled → checkout with no Trial; trial_ended / payment_failed → portal.
