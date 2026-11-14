# Dodo subscription lifecycle and trial

Type: research Status: resolved Blocked by:

## Question

How do Dodo Payments subscriptions behave end to end, for a product with a 15-day trial? Can a Trial
start with no payment method (card-less), or does checkout always collect a mandate? If card-less is
impossible, what is the closest pattern (e.g. our own trial clock, then checkout with no trial)?
Cover: all subscription statuses and transitions (pending, active, on_hold, cancelled, failed,
expired…), trial fields, renewal retries / dunning on a failed charge, cancel at period end vs
immediately, reactivate / re-subscribe after cancel or expiry, deleting a customer, and every
webhook event + payload shape relevant to these, with signature verification (standard-webhooks) on
Cloudflare Workers. Note test-mode specifics (test cards, simulating renewal/failure). Use `dodo`
CLI read-only only.

## Answer

Card-less Trial **is possible**: product price flag `trial_payment_method_optional` (dashboard
"Start the trial without a card", free trial only, shipped v1.113.28). Sub is `active` at once with
`has_payment_method: false`; Dodo emails an add-card reminder; no card at trial end → `on_hold`;
adding a card charges dues → `active`. With card: $0 mandate at start, first charge at trial end
(`payment.succeeded` + `subscription.renewed`). No trial status field — derive it ourselves.

Statuses `pending|active|past_due|on_hold|paused|cancelled|failed|expired`; last three terminal →
re-subscribe = new checkout/sub id. Grace (`past_due`, 1-30d, then `on_hold`|`cancelled`), payment
retries (up to 8, ≤30d) and dunning emails are all dashboard settings, off by default. Cancel:
`PATCH cancel_at_next_billing_date:true` or `status:'cancelled'`. Reactivate `on_hold` via
`updatePaymentMethod` / portal. No delete-customer API. Webhooks = Standard Webhooks; SDK
`webhooks.unwrap` is pure JS, Workers-safe. Test: card `4000000000000341` fails renewals; bump
`next_billing_date` to simulate trial end/renewal.

Surprises: Prevent Trial Misuse matches by email (keep off for multi-org owners); portal is
per-customer not per-sub; unverified whether card-less sub can be created server-side without a
checkout visit (needs prototype).

Detail + citations: `.scratch/billing/research/dodo-subscription-lifecycle.md`.
