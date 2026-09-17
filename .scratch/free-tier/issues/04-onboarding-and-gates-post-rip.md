# 04 — Onboarding flow and route gates after the rip

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: [02](02-stripe-rip-inventory.md)

## Question

With `paymentMiddleware` and `checkOrgPaymentDone` gone, what do `_authed/_community.tsx`,
`/onboarding/create`, `/onboarding/invitations` and post-create redirects do? Decide:

- `_community.tsx` becomes a plain shell (no banner) — or keeps any gate?
- Post-create-org redirect target; post-accept-invite redirect target.
- Settings overview: what replaces the billing card (nothing / org usage `members n/1000`)?
- `AuthUser.tsx` menu after portal link removal.
- ADR 0002 supersede note wording; whether a new ADR for "free tier with hard caps" meets the
  three-part ADR bar (hard to reverse / surprising / real tradeoff).

## Comments

**Resolution** (grilling, 2026-09-17):

- `_community.tsx`: drop `beforeLoad` entirely → plain shell. `_authed.tsx` already gates no-session
  / no-`activeOrganizationId`. Delete `src/lib/billing-status-map.ts` with it.
- Post-create-org: no change; `OnboardingForm` already navigates to `/dashboard`.
- Post-accept-invite: navigate to `/dashboard` after success (better-auth sets accepted org active).
  Error toast must surface `error.message` (Organization limit `APIError` from
  `beforeAcceptInvitation`) instead of generic "Failed to accept invitation".
- Settings overview: no billing card exists today. **Add** read-only org-usage block above Danger
  Zone: `Org Members n/1000`, `Community Profiles n/1000`, via one `getOrgUsage` server fn on
  `limits-db.ts` counters. Visual handed to [05](05-limit-ui-prototype.md). Fix "billing records"
  wording in delete-org confirmation copy.
- `AuthUser.tsx`: remove "Manage billing" item, `openBillingPortal` import, `billing_portal_opened`
  event. Nothing replaces it.
- ADR 0002: delete bullet 1, retitle "Auth known limitations", add "Amended 2026-09-17: Stripe org
  deletion bullet removed with billing rip" note. Bullets 2-5 stay live; file not superseded.
- New ADR 0003 "Hardcoded free-tier limits" — yes, 3 bullets: constants not config; pending
  invitations reserve Member-limit slots; count/insert race accepted. Written by impl ticket, not
  here (planning only).
