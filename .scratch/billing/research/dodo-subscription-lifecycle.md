# Dodo subscription lifecycle and trial

Ticket: `.scratch/billing/issues/01-dodo-subscription-lifecycle.md`. Researched 2026-11-13.

Sources (primary):

- Subscriptions feature doc: https://docs.dodopayments.com/features/subscription (sections Trials,
  Card-Optional at Zero Price, Subscription States, State Machine, On Hold, Grace Period, Webhook
  Events by Transition, API Management)
- Integration guide:
  https://docs.dodopayments.com/developer-resources/subscription-integration-guide
- Subscription webhooks:
  https://docs.dodopayments.com/developer-resources/webhooks/intents/subscription
- Webhooks (delivery, retries, signature):
  https://docs.dodopayments.com/developer-resources/webhooks
- Cloudflare Worker example:
  https://docs.dodopayments.com/developer-resources/webhooks/examples/cloudflare-example
- Payment retries: https://docs.dodopayments.com/features/recovery/payment-retries
- Dunning: https://docs.dodopayments.com/features/recovery/subscription-dunning
- Checkout sessions: https://docs.dodopayments.com/developer-resources/checkout-session
- Customer portal: https://docs.dodopayments.com/features/customer-portal
- Testing: https://docs.dodopayments.com/miscellaneous/testing-process
- CLI: https://docs.dodopayments.com/developer-resources/sdks/cli
- Changelog v1.113.28 (Sep 10 2026: card-optional, `past_due`, split cancel controls):
  https://docs.dodopayments.com/changelog/v1.113.28
- SDK types: npm `dodopayments@2.62.0` (`resources/subscriptions.d.ts`,
  `resources/products/products.d.ts`, `resources/webhooks/webhooks.{d.ts,js}`,
  `resources/customers/*.d.ts`, `resources/checkout-sessions.d.ts`), dep `standardwebhooks@^1.0.0`.
- `dodo products info pdt_0NrRhQONNdCc90vSRvBEo` (read-only): Standard, $5.00 every 1 Month, saas.
  CLI output does **not** show trial / card-optional / subscription-period fields.

## TL;DR

- **Card-less trial IS possible.** Product recurring price has `trial_payment_method_optional`
  (dashboard checkbox **"Start the trial without a card"** under Trial Period (Days)). Free trial
  only — a paid trial (`trial_amount`) always needs a card. Shipped in v1.113.28 (Sep 2026).
- Card-less sub is created **and `active` immediately**, `has_payment_method: false`. Dodo emails an
  "Add Payment Method Reminder" N days before trial end (Settings → Subscriptions → Payment Method
  Reminder). No card at trial end → `on_hold` (+ "Subscription On Hold, No Payment Method" email).
  Adding a card (portal or `updatePaymentMethod`) charges dues → `active`.
- With a card: trial start = $0 mandate auth, `subscription.active`; trial end = first charge,
  `payment.succeeded` + `subscription.renewed`.
- Statuses: `pending | active | past_due | on_hold | paused | cancelled | failed | expired`.
  `cancelled`, `failed`, `expired` are terminal → re-subscribe = new checkout, new
  `subscription_id`.
- No trial status field on the subscription. Trial = our own derivation (e.g.
  `created_at + trial_period_days > now`, or `next_billing_date` still in trial window).
- Grace (`past_due`), payment retries and dunning are **all off by default** (merchant dashboard
  settings). Grace 1-30 days, then `on_hold` or `cancelled` (configurable).
- Cancel: `PATCH {cancel_at_next_billing_date: true}` (period end) or `PATCH {status: 'cancelled'}`
  (now). No customer delete API exists.
- Webhooks = Standard Webhooks; SDK `client.webhooks.unwrap(rawBody, {headers})` uses pure-JS
  `standardwebhooks` → Workers-safe. Dodo ships a Cloudflare Worker example.

## Trial

### Config

| Field (product recurring price)       | Meaning                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `trial_period_days`                   | Trial length, 0 = none. Override per checkout with `subscription_data.trial_period_days` (0-10000). |
| `trial_amount`                        | Paid trial upfront charge. Omit for free trial. Paid trial ⇒ card required.                         |
| `trial_payment_method_optional`       | "Let a customer start a free trial with no card. Defaults to false."                                |
| `zero_amount_payment_method_optional` | Card-optional when $0 price / 100% discount. Not our case.                                          |

Source: SDK `products.d.ts` recurring price;
https://docs.dodopayments.com/features/subscription#card-optional-at-zero-price

Action for user: in dashboard, Standard product price → check **Start the trial without a card**
(CLI can't confirm current value). Also confirm subscription period = **20 Year** (recommended max);
a period equal to the billing frequency makes the sub `expired` after one cycle (SDK `products.d.ts`
`subscription_period_count` doc).

### Card-less flow (docs, "What Happens Without a Card")

1. Checkout preview returns `payment_method_required: false`; sub created + activated immediately,
   `has_payment_method: false`, `payment_method_id: null`.
2. Reminder email before billing starts; days set in **Settings → Subscriptions → Payment Method
   Reminder**. Email links to Customer Portal.
3. No card when the first real charge is due → `on_hold`, email "Subscription On Hold, No Payment
   Method".
4. Card added (before trial end → next renewal charges it, no hold; after → charge for dues, back to
   `active`).

**Open / unverified:** whether a card-less sub can be created purely server-side (no customer visit
to hosted checkout). Hints it can: `POST /subscriptions` (SDK `subscriptions.create`, marked
`@deprecated`) returns `subscription_id` + `payment_method_required` directly, with `payment_link`
defaulting false; checkout sessions with `confirm: true` finalise at creation. Docs never state
either path activates without the customer opening checkout. Needs a Test Mode prototype (write
calls, out of scope here).

### With-card trial

- Trial start: $0 mandate authorization saves the card, `subscription.active` fires; a $0 payment
  appears in payments list.
- Trial end: first recurring charge; `payment.succeeded` **with** `subscription.renewed`.
- Source: integration guide "Webhook sequence … With a trial period".

### Detecting / changing trial

- "The subscription object has no trial status field." Docs suggest: one payment with
  `total_amount === 0` ⇒ in free trial. Card-less sub may have no payment at all, so use
  `created_at`/`trial_period_days`/`next_billing_date` and own DB instead.
- Extend trial: `PATCH /subscriptions/{id} {next_billing_date}` (must be future). Doubles as support
  override + test lever.

### Prevent Trial Misuse (surprise, affects per-org model)

Setting (Settings → Subscriptions, off by default). Matches customers by **normalized email**; a
customer who already redeemed a trial of the product gets a paid sub. Our billing email = an owner's
email, so owner of 2 orgs would get no trial on org 2. Keep it **off**, or pass
`subscription_data.trial_period_days` explicitly ("skips the check and grants that trial").

## Statuses and transitions

Enum (SDK `SubscriptionStatus`):
`pending | active | on_hold | paused | cancelled | failed | expired | past_due`.

| Status      | Meaning                                                                         | Recover                                    |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| `pending`   | being created                                                                   | wait for `active`/`failed`                 |
| `active`    | renews automatically (incl. trial)                                              | —                                          |
| `past_due`  | renewal failed, grace open, customer keeps access                               | settle debt before `past_due_ends_at`      |
| `on_hold`   | renewal / plan-change charge failed, or card-less trial ended; renewals stopped | retries, dunning, or update payment method |
| `paused`    | deliberate freeze                                                               | `PATCH {status:'active'}`                  |
| `cancelled` | will not renew                                                                  | new subscription only                      |
| `failed`    | creation / initial mandate failed, terminal                                     | new subscription                           |
| `expired`   | term (`subscription_period`) ended                                              | new subscription                           |

State machine (docs):

```
pending → active | failed
active → on_hold (renewal fail, no grace; plan-change fail; card-less trial end)
active → past_due (renewal fail, grace on)
past_due → active (debt settled) | on_hold or cancelled (window ends, per setting) | cancelled
on_hold → active (payment method updated / retry succeeds / late payment succeeds)
active|on_hold|paused|past_due → cancelled
active ↔ paused; active → expired
```

- Late renewal success after `on_hold`/`past_due` returns to `active` on its own,
  `next_billing_date` unchanged (docs "On Hold State").
- Plan changes rejected while `past_due` (irrelevant, single plan).
- `cancelled_by` (`actor_type: customer | merchant_user | api_key | dodo_team`), `cancelled_at`,
  `cancel_at_next_billing_date` on object + every `subscription.*` webhook. `cancelled_by` null when
  Dodo cancels (dispute, grace end…).

## Failed renewal: grace, retries, dunning

All three are dashboard settings, **off by default**.

- **Grace period** (Settings → Subscriptions → Subscription Grace Period): 1-30 days (default 3).
  Status after window: `on_hold` or `cancel_subscription`. During window: `past_due`, access kept,
  `subscription.past_due` carries `past_due_ends_at` — **store it; API GET does not return it**.
  Every sub webhook during window repeats it. Window fixed at entry.
- **Payment retries** (Settings → Recovery): renewal payments only (not first payment / mandate).
  Standard schedule waits 12h, 24h, 48h, 72h, 96h, 120h, 7d, 7d (up to 8), bounded by recovery
  window (default 13 days ⇒ attempts 1-5). Custom: 1-8 retries ≤30 days. Soft declines retried, hard
  declines end chain. Success → `active`, `next_billing_date` moves to one period after success.
  Exhausted → status unchanged. Cancel stops retries; other statuses keep retrying. Manual retry:
  `POST /payments/{payment_id}/retry` or dashboard; portal "Retry Payment" when retries on.
- **Dunning** (Settings → Recovery): triggers on `on_hold`, `past_due`, and customer-portal cancel.
  Up to 4 emails per sequence (defaults day 1/3/5/7), linking to portal (or re-purchase checkout for
  cancelled). Webhooks `dunning.started`, `dunning.recovered`. Attempt `exhausted` doesn't change
  sub.

Mapping to our "7-day grace then Lock": enable Dodo grace = 7 days, after-window = `on_hold` (keeps
sub recoverable without new checkout). Lock on `on_hold`/`cancelled`/`expired`/`failed`; banner on
`past_due` until `past_due_ends_at`. Alternative: grace off and run our own 7-day clock from
`subscription.on_hold` — simpler for testing but Dodo marks access revoked.

## Cancel / reactivate / re-subscribe

- Cancel at period end: `PATCH /subscriptions/{id} {cancel_at_next_billing_date: true}`. Revoke: set
  `false`. Sub stays `active` till `next_billing_date`, then `cancelled`.
- Cancel now: `PATCH {status: 'cancelled'}` (+ optional `cancel_reason` `cancelled_by_merchant`,
  `cancellation_comment`, `cancellation_feedback`). For our "delete org ⇒ cancel immediately, no
  refund".
- Portal settings: **Allow Immediate Cancellation** and **Allow Cancellation at Next Billing Date**
  (both on by default) — turn off immediate to match "Cancel: access until paid period ends".
- Reactivate `on_hold`: `POST /subscriptions/{id}/update-payment-method` with
  `{payment_method:{type:'new', return_url}}` → response `payment_id` + `payment_link` (redirect
  customer) → `payment.succeeded` then `subscription.active`. Or
  `{type:'existing', payment_method_id}`. Portal does the same ("Link Payment Method" / Update
  Payment Method).
- Re-subscribe after `cancelled`/`expired`/`failed`: new checkout session ⇒ new `subscription_id`.
  Our org row must allow replacing its current subscription id.
- Pause exists (`status:'paused'`), not needed.

## Customers

- API: create, get, list, update, portal session, list/delete payment methods. **No delete customer
  endpoint** (api-reference index; SDK `customers.d.ts`). Delete org = cancel sub, keep Dodo
  customer, drop our mapping.
- Checkout attaches to existing customer **by email** by default; `always_create_new_customer: true`
  forces a new one. `customers.create({email, name, metadata})` also possible, then
  `customer: {customer_id}` in checkout.
- Portal session `customers.customerPortal.create(customer_id, {return_url, send_email})` is **per
  customer**, not per subscription — if one Dodo customer per owner email, the portal shows every
  org's sub. Per-org customer (create one per org, name = org name, metadata.orgId) keeps portals
  scoped. Detail belongs to ticket 06.

## Webhooks

### Subscription events (all carry full `Subscription` + `past_due_ends_at?` + `payment_id?`)

| Event                                                                                                             | When                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `subscription.active`                                                                                             | activated (incl. trial start, card-less too), reactivated from `on_hold`/`past_due`   |
| `subscription.updated`                                                                                            | any field change                                                                      |
| `subscription.renewed`                                                                                            | renewed for next period (incl. first charge at trial end); `payment_id` set only here |
| `subscription.past_due`                                                                                           | renewal failed, grace opened; `past_due_ends_at`                                      |
| `subscription.on_hold`                                                                                            | renewal fail without grace / grace ended / card-less trial ended                      |
| `subscription.cancelled`                                                                                          | cancelled (immediate, or when scheduled cancel takes effect)                          |
| `subscription.expired`                                                                                            | term ended                                                                            |
| `subscription.failed`                                                                                             | creation / mandate failed                                                             |
| `subscription.plan_changed`, `subscription.paused`, `subscription.unpaused`, `subscription.update_payment_method` | n/a for us except `update_payment_method` (track `has_payment_method`)                |

Also relevant: `payment.succeeded|failed|processing|cancelled` (payment has `subscription_id`,
`charge_type: new|renewal|plan_change|on_demand`, `service_periods[]`), `dunning.started`,
`dunning.recovered`, `invoice.*`. Guidance: extend access on `subscription.renewed`, not
`payment.succeeded` alone.

Key `Subscription` fields (SDK): `subscription_id`, `status`, `customer.customer_id`, `product_id`,
`metadata` (put `orgId` here), `has_payment_method`, `payment_method_id`, `trial_period_days`,
`created_at`, `previous_billing_date`, `next_billing_date`, `cancel_at_next_billing_date`,
`cancelled_at`, `cancelled_by`, `expires_at`, `recurring_pre_tax_amount`, `currency`.

Envelope: `{business_id, type, timestamp (ISO), data: {payload_type: 'Subscription', ...}}`.

### Delivery

- 30 s timeout; ack 2xx fast (Worker: `ctx.waitUntil` or just do small D1 writes inline).
- Retries: 8 attempts — immediate, 5s, 5m, 30m, 2h, 5h, 10h, 10h. Dashboard replay / bulk recover.
- **Out of order possible**; use envelope `timestamp`, payload is latest state at delivery. Safest:
  on any `subscription.*` event, upsert from `data` if `timestamp` newer than stored (or re-GET the
  sub).
- Idempotency via `webhook-id` header.
- No IP allowlist; signature is the auth.

### Verification on Cloudflare Workers

- Headers `webhook-id`, `webhook-timestamp` (unix s), `webhook-signature` (`v1,<b64>` space-sep).
  Signed content `{id}.{timestamp}.{rawBody}`; key = base64-decode secret minus `whsec_`;
  HMAC-SHA256; 5 min tolerance.
- SDK: `new DodoPayments({bearerToken, environment:'test_mode', webhookKey})`;
  `client.webhooks.unwrap(await request.text(), {headers:{...}})` → typed `UnwrapWebhookEvent`;
  internally `new standardwebhooks.Webhook(key).verify(body, headers)`
  (`resources/webhooks/webhooks.js`). `standardwebhooks` deps `fast-sha256`, `@stablelib/base64` —
  pure JS, no `node:crypto`. Dodo's Worker example does exactly this with `request.text()`.
- Must use raw body (`request.text()`) before JSON parse.
- Secret rotation: old secret valid 24 h.

## Test mode

- SDK `environment: 'test_mode'` (default `live_mode`); hosted checkout on
  `test.checkout.dodopayments.com`.
- Cards (expiry 06/32, CVV 123): success `4242424242424242`, `5555555555554444`; decline
  `4000000000000002` (generic), `4000000000009995` (insufficient funds); **renewal-failure card
  `4000000000000341`** (exp 12/34) — succeeds at signup, declines next charge.
- Simulate renewal / trial end: `PATCH /subscriptions/{id} {next_billing_date: <now+1min>}` (must be
  future). Documented test recipe: subscribe with 4242, switch card to …0341 in portal, bump
  `next_billing_date` → `payment.failed` + `on_hold` (or `past_due`).
- First charge `payment.succeeded` may take 2-10 min in test mode.
- Local webhooks: `dodo wh listen http://localhost:3000/api/...` (test key only; auto-creates relay
  endpoint; keeps headers but re-serializes JSON so **signature can fail** byte mismatch).
  `dodo wh trigger <event> <url>` sends **unsigned** mock payloads (use `unsafeUnwrap`), doesn't
  support `subscription.past_due`/`unpaused`/invoice events. Dashboard Testing tab sends signed
  examples. Tunnel (e.g. cloudflared) is the faithful option.

## Implications for standing decisions

- "Trial: card-less if Dodo allows" → **allowed**. Native card-less trial: Dodo sub exists from org
  creation, `active` during trial, Dodo sends add-card reminder + on-hold email, `on_hold` at trial
  end = Lock. "Invoice due on <date>" = `next_billing_date`.
- Fallback if server-side creation without checkout visit proves impossible: own trial clock in D1
  (no Dodo object at org create), then checkout with `trial_period_days: 0` (or remaining days) when
  owner adds payment. Decide after prototype.
- Failed renewal 7-day grace maps cleanly to Dodo grace period (7 days, then `on_hold`).
- Owner of many orgs: keep Prevent Trial Misuse off; consider per-org Dodo customer for scoped
  portal.
- Our emails vs Dodo: Dodo can send add-card reminder, on-hold, dunning emails — overlap with our
  planned T-3/T-1/on-payment-failure emails; pick one owner (ticket 03).

## Unresolved

- Card-less sub creatable server-side without checkout visit? (prototype in Test Mode)
- Standard product: card-less checkbox on? subscription period 20 Year? (check dashboard)
- Does `subscription.cancelled` fire at schedule time or effect time for
  `cancel_at_next_billing_date` (docs imply effect time; `subscription.updated` at schedule time).
  Verify in test.
