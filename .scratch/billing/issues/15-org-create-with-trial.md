# Org create starts the Trial

Status: ready-for-agent Blocked by: 14

## What to build

`createOrganizationFn` (country required) replaces client org create in `OnboardingForm`. Creates
org, `orgBilling` row, then idempotent `ensureSubscription` (Dodo customer + card-less sub). Dodo
down → org still created, `needsSubscription`. `billing_trial_started` event. Redirect
`/dashboard?trialStarted=1` → one-time Trial started dialog (owners).

## Spec

[spec.md](../spec.md): Org create, Dodo calls, UI → Trial started dialog.

## Done when

- [ ] New org in Test Mode has a Dodo customer (name = org, email = creator) + `active` sub,
      `has_payment_method:false`; row `trialEndsAt` = sub created + 15d.
- [ ] Confirm `billing: { country }` alone is accepted (record result in spec "Not verified").
- [ ] Dodo failure (mock) → org exists, `needsSubscription`; second `ensureSubscription` creates
      only the missing step.
- [ ] ORG_LIMIT still enforced.
