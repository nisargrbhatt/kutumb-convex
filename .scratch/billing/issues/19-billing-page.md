# Owner billing page

Status: ready-for-agent Blocked by: 15, 16

## What to build

`/settings/billing` (owner-only, SettingNav entry, breadcrumbs): status card + state button, payment
method + billing details cards, invoices table with PDF route, cancel zone dialog. Server fns
`getBillingFn`, `openPortalFn`, `startCheckoutFn`, `cancelSubscriptionFn`, `resumeSubscriptionFn` (+
`billing_checkout_opened`). `/api/billing/invoice/$paymentId`.

## Spec

[spec.md](../spec.md): UI → Billing page, Dodo calls.

## Done when

- [ ] Non-owner gets redirected; server fns reject non-owners.
- [ ] Add card mid-Trial via portal → "Trial · first charge $5 on <date>", no charge.
- [ ] Cancel → `canceling`, Resume → back; PDF only for own org's payments.
- [ ] Mobile → ultrawide checked; copy from prototype.
