# Billing UX prototype

Type: prototype Status: resolved Blocked by: 03, 04, 05

## Question

How should the owner billing settings page, Trial banner, "Trial started" dialog, grace banner and
lock screens (owner vs non-owner) look and behave across mobile → ultrawide? Rough throwaway UI to
react to: status card, next charge / amount due, payment method + "Update" (portal), invoice table,
cancel / re-subscribe, and the copy for each state.

## Comments

- From 05: states
  `pending | trialing(±card) | active | canceling | grace | locked(trial_ended | payment_failed | canceled)`;
  org create form gains billing address fields.

- From 06: org create form gains a required country select (only address field).
- From 07: lock screen = own `/locked` route outside `_community`; must include org switcher
  (`CommunityPicker`), sign out (`AuthUser`), create-org link; owner: pay/portal + delete/transfer
  dialogs; non-owner: "ask an owner" + Leave organization.

## Answer

Prototyped 2026-11-14; user picked **Variant A (stacked cards)** across all surfaces. Prototype
(A/B/C + state fixtures + switcher) on local branch `prototype/billing-ux` (commit 4323a47, never
merge): `src/routes/_authed/_community/settings/billing-prototype/index.tsx`.

- **Billing page** `/settings/billing` (owner-only, new SettingNav entry, breadcrumbs Settings →
  Billing), single column `max-w-3xl`:
  1. Status card: title + state badge + one-line body, Trial progress bar, one state-specific
     primary button (none while `pending`).
  2. Two cards (`md:` side by side): Payment method (last4 + expiry or "None added", Add/Update →
     Dodo portal) and Billing details (org name · country, receipt email).
  3. Invoices card: shadcn simple Table (date, amount, status, PDF); empty: "No invoices yet.
     Invoices appear here after each payment."
  4. Cancel zone (bordered destructive, `trialing|active` only): "You keep access until <date>. Data
     is kept; re-subscribe any time." → portal cancel at period end.
- **Primary button per state:** trialing no card "Add payment details"; trialing with card / active
  "Manage payment"; canceling "Resume subscription"; grace "Update payment details" (destructive);
  locked payment_failed "Update payment details"; locked trial_ended/canceled "Subscribe ·
  $5/month".
- **Banner:** full-width strip above `_community` pages, tone info → warning at ≤3 Trial days →
  danger in grace; owner CTA button on the right. Owner copy: "<n> days left in trial · no charge
  unless you add payment details" / "Trial · first charge $5 on <date>" / "Confirming your payment…"
  / "Subscription canceled · access until <date>" [Resume] / "Payment failed · update payment
  details before <date> to avoid a lock" [Update payment]. Active: no banner. Members: only in last
  3 Trial days, no card: "<org>'s trial ends <date>. An owner (<names>) needs to add payment
  details." No CTA.
- **Lock screen** `/locked`: centred card `max-w-md`: lock icon, title, body, "Your data is safe.
  Nothing is deleted while locked.", actions, separator, Switch organization / Create organization /
  Sign out. Owner: primary pay button + Transfer ownership / Delete organization (ghost). Member:
  "<org> is locked. An owner needs to subscribe|update the payment details… Owners: <names>." +
  Leave organization.
- **Lock titles:** trial_ended "Your free trial has ended"; payment_failed "Payment failed" (…"after
  several tries. Update your payment details to unlock right away."); canceled "Subscription ended"
  (…"Re-subscribe for $5/month to pick up where you left off.").
- **Trial started dialog:** "Your 15-day free trial has started"; body names org, end date, "No
  charge unless you add payment details", $5/month per org; [Later] [Add payment now].
- Copy for all states as in the prototype's `headline()` / `lockCopy()`; reuse verbatim in spec.
