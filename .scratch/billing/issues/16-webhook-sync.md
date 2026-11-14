# Dodo webhook route and state sync

Status: ready-for-agent Blocked by: 14

## What to build

`POST /api/billing/webhook`: verify (`webhooks.unwrap`), dedupe on `webhook-id`, resolve org,
adopt-or-ignore sub id, `subscriptions.retrieve` → overwrite row, store `past_due_ends_at`. Diff
`billingAccess` before/after → PostHog
`billing_subscribed | billing_payment_failed | billing_canceled | billing_resubscribed`.
`syncBillingFn` for `?from=dodo` returns.

## Spec

[spec.md](../spec.md): Webhook, Analytics, Local dev and testing.

## Done when

- [ ] Bad signature 401; duplicate id 200 with no write; unknown org 200.
- [ ] Out-of-order events end in Dodo's latest state.
- [ ] Re-subscribe sub replaces a terminal sub id; a stray non-current sub is ignored.
- [ ] Integration test with a signed fixture.
