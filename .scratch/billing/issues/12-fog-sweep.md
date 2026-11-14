# Fog sweep: overrides, analytics, tax display, Locked data

Type: grilling Status: resolved Blocked by:

## Question

Close the remaining "Not yet specified" patches before the spec: support overrides (extend Trial /
comp an org), PostHog billing analytics, price/tax display in-app, and lifecycle of a long-Locked
org's data. Local dev + testing folds into "Write the billing spec" (research already gives
`dodo wh listen`, cloudflared tunnel, `trial_period_days` as test lever).

## Answer

- **Support overrides:** none in v1. No comp flag, no admin UI. One-off cases go through the Dodo
  dashboard (e.g. move `next_billing_date`) or a manual D1 edit. Out of scope.
- **Analytics:** v1 ships server-side PostHog events (`src/lib/posthog-server.ts`), keyed by org
  group: `billing_trial_started`, `billing_checkout_opened`, `billing_subscribed`,
  `billing_payment_failed`, `billing_locked`, `billing_canceled`, `billing_resubscribed`. Fire from
  the webhook handler / server fns, never the client. (Ticket 06 already adds a trial-start event
  with `createdByUserId`; that is the same `billing_trial_started` event.)
- **Price/tax display:** show pre-tax USD from `recurring_pre_tax_amount` as "$5/month + applicable
  tax". Exact tax-inclusive total only on Dodo checkout, Dodo emails, and invoices. No extra API
  calls for tax.
- **Locked org data:** kept forever. Owners can pay or delete at any time. A deletion/retention
  policy is out of scope (later effort).
