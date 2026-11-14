# Dodo: invoices, hosted checkout, Customer Portal, native emails

Ticket: `.scratch/billing/issues/03-dodo-invoices-portal-emails.md`. Sources: docs.dodopayments.com
(fetched 2026-11-13, OpenAPI v1.122.7) + `dodopayments` npm SDK v2.62.0 type defs. No CLI calls
needed.

## TL;DR

- Dodo gives us for free: invoice PDF per successful payment, hosted checkout, hosted Customer
  Portal (card update, cancel, invoices/billing history, billing name+address, retry failed
  payment), and customer emails (receipt w/ invoice link, trial ending, cancelled, etc.).
- We must build: billing status UI in-app (trial days left, next charge date/amount, Lock), owner
  fan-out emails (Dodo only emails the one customer email), card-expiring warning (no Dodo email),
  any "invoice due on <date>" UI (no upcoming-invoice object for checkout-led subscriptions).
- Portal link = API call per click (24h expiry). Invoice list = API call (`payments.list` by
  `subscription_id`/`customer_id`) or just send owners to the portal.

## 1. Invoices

### Checkout-led (normal) subscriptions — what we'd use

- One invoice auto-generated **per successful payment** (one-time and each renewal). Not attached to
  the email; email has a **Download invoice** button → signed PDF link valid 30 days.
  [invoice-generation](https://docs.dodopayments.com/features/invoice-generation.md)
- Invoice only exists for a **succeeded** payment ("Payment Status: Paid"). No draft/open/due
  invoice for upcoming renewals. Subscription invoices show plan as line item but **no billing
  period, no next renewal date**.
  [invoice-generation](https://docs.dodopayments.com/features/invoice-generation.md)
- PDF via API: `GET /invoices/payments/{payment_id}` → `application/pdf` (SDK
  `client.invoices.payments.retrieve(paymentId)`). Payment object carries `invoice_id`;
  `invoice_url` is **deprecated** ("Use `GET /invoices/payments/{payment_id}` with an API key").
  [get-invoice](https://docs.dodopayments.com/api-reference/payments/get-invoice.md),
  [list-payments schema](https://docs.dodopayments.com/api-reference/payments/get-payments.md) → if
  we show a download link in-app, proxy through a server fn (keeps API key server-side).
- Listing per customer: `GET /payments?customer_id=…&subscription_id=…&status=…` (paged, date
  filters). Each item has `invoice_id`, amount, status, `card_last_four`, `card_network`.
  [list-payments](https://docs.dodopayments.com/api-reference/payments/get-payments.md)
- Refund invoices: `client.invoices.payments.retrieveRefund(refundId)` (SDK).

### "Upcoming invoice" / amount due

- `GET /subscriptions/{id}/upcoming-invoice` exists but only for **invoice-led** subscriptions
  ("Price the next cycle invoice of an invoice-led subscription").
  [get-upcoming-invoice](https://docs.dodopayments.com/api-reference/subscriptions/get-upcoming-invoice.md)
- For normal subscriptions, derive "next charge" from the Subscription object: `next_billing_date`,
  `recurring_pre_tax_amount`, `currency`, `tax_inclusive`, `trial_period_days`,
  `has_payment_method`, `status`, `cancel_at_next_billing_date`. Tax-inclusive total not on the
  object (trial-ending/renewal emails show amount incl. tax; we'd show pre-tax or "plus tax").
  [get-subscription](https://docs.dodopayments.com/api-reference/subscriptions/get-subscriptions.md)
- No trial-status field: docs say detect free trial via payments list (exactly one $0 payment) or
  `next_billing_date` within trial window.
  [subscription#detecting-trial-status](https://docs.dodopayments.com/features/subscription.md)

### Invoice-led billing (alternative, probably not for us)

- Separate model (`billing_mode: invoice_led`): draft → finalize → `open` with due date →
  `paid`/`past_due`/`void`/`uncollectable`. Hosted invoice page (`hosted_url`), reminder emails,
  auto-charge or manual pay, free trials supported (creates paid $0 invoice), webhooks
  `invoice.finalized|sent|paid|past_due|payment_failed|voided|marked_uncollectable|reopened`.
  Created via dashboard or `POST /billing/subscriptions`, not checkout. Customer needs full billing
  address before finalize. No pause / `collect_via_payment_link` on plan change.
  [invoice-based-billing](https://docs.dodopayments.com/features/invoice-based-billing.md),
  [invoice webhooks](https://docs.dodopayments.com/developer-resources/webhooks/intents/invoice.md)
- Built for B2B net-terms. Would make "Invoice due on <date>" literal, but adds address
  requirement + more states. Recommend: stay checkout-led; "invoice due" stays UX framing over
  `next_billing_date`.

## 2. Hosted checkout

- `POST /checkouts` (SDK `checkoutSessions.create`) → `{ session_id, checkout_url, ... }`. Session
  valid **24h** (15 min when `confirm: true`).
  [checkout-session guide](https://docs.dodopayments.com/developer-resources/checkout-session.md),
  [create](https://docs.dodopayments.com/api-reference/checkout-sessions/create.md)
- `return_url`: redirect after success or failure, with query params `subscription_id`, `status`,
  `email` (+ `payment_id` for one-time). `cancel_url`: shows a back button. Return params are not
  proof of payment — webhook is source of truth.
- Prefill customer: `customer: { customer_id }` (existing) or `{ email, name, phone_number }` (new;
  by default matched to existing customer by email unless
  `feature_flags.always_create_new_customer`). Also `billing_address`, `tax_id`,
  `customer_business_name`. Lock fields with `feature_flags.allow_customer_editing_email|name|…`. →
  Since one Dodo customer per org (owner's email), pass `customer_id` once created, else email
  matching could merge two orgs of the same owner into one Dodo customer. Use
  `always_create_new_customer` or pre-create customer (ticket 06).
- Discounts: `discount_codes: string[]` (max 20, stacked; `discount_code` deprecated);
  `feature_flags.allow_discount_code` (default true) controls whether customer can type codes. Out
  of scope per map → set `allow_discount_code: false`.
- Others: `metadata` (put `organizationId`), `subscription_data.trial_period_days` (overrides
  product trial; explicit value skips trial-misuse check), `show_saved_payment_methods`,
  `feature_flags.redirect_immediately`, `single_page`, `minimal_address`, `short_link`,
  overlay/inline checkout SDKs.
- Card-less trial: product price option **"Start the trial without a card"**
  (`trial_payment_method_optional`). Subscription is created + active with
  `has_payment_method: false`; customer adds card later via portal; else `on_hold` at trial end.
  [subscription#card-optional-at-zero-price](https://docs.dodopayments.com/features/subscription.md)
  (Lifecycle detail belongs to ticket 01.)

## 3. Customer Portal

- Session: `POST /customers/{customer_id}/customer-portal/session?return_url=…&send_email=…` →
  `{ link }` (SDK `customers.customerPortal.create(id, { return_url, send_email })`). Link signed,
  **expires 24h**, logs customer in directly (no email step). `return_url` shows a "Return to
  {business}" back link; overrides business default. `send_email: true` makes Dodo email the link.
  [create session](https://docs.dodopayments.com/api-reference/customers/create-customer-portal-session.md),
  [customer-portal](https://docs.dodopayments.com/features/customer-portal.md) → Generate on click
  (server fn, owner-only), redirect. Never cache/store the link.
- Static link `https://customer.dodopayments.com/login/{business_id}` → email magic link sign-in
  (not sent in Test Mode). Also a cross-merchant Unified Portal at customer.dodopayments.com.
  Implication: anyone with access to the **billing email inbox** can reach the portal regardless of
  our owner check. Fine, but worth knowing.
- Offers:
  - Billing history: every payment w/ amount, status, method, **invoice download** (opens in
    browser).
  - Subscriptions: plan, price, renewal date, payment method; **Link Payment Method** when none.
  - **Update payment method** (pick saved or add new). On `on_hold`: charges dues and reactivates.
    With no dues: $0 verification payment, `payment.succeeded` fires, no receipt email.
  - **Retry Payment** button for `on_hold`/`past_due` if Payment Retries on.
  - **Cancel**: at next billing date and/or now — separate toggles under Settings → Subscriptions
    (both on by default). Requires reason (`cancellation_feedback`) + optional comment. Scheduled
    cancel → **Revoke Cancellation** button.
  - Optional (off by default): plan change, pause, retention-offer discount.
  - Billing info: customer can edit **name + billing address** (email shown, not editable).
- Settings we'd want: **Allow Immediate Cancellation = off** (map: cancel = access till period end);
  Allow Cancellation at Next Billing Date = on; pause off; plan change off; retention offer off (or
  on—product call).
- Portal is per Dodo **customer**, not per subscription. If one Dodo customer had several org
  subscriptions they'd all show in one portal → reinforces one customer per org.

## 4. Native customer emails

Configured in Settings → Communication → Email → Customer Emails; each toggleable except where
noted.
[communication-preferences#customer-emails](https://docs.dodopayments.com/features/communication-preferences.md)

| Email                                        | Default | Notes                                                                                              |
| -------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| Payment Succeeded (receipt)                  | on      | Receipt + **Download invoice** button                                                              |
| Subscription Trial Ending                    | on      | ~**2 days** before trial end, amount incl. tax; not sent if set to cancel at trial end             |
| Upcoming Renewal Reminder                    | off     | ~2 days before renewal                                                                             |
| Payment Failed                               | off     | any failed payment                                                                                 |
| Subscription Renewal Failed                  | off     | renewal failures only                                                                              |
| Subscription Cancelled                       | on      | immediate cancel                                                                                   |
| Subscription Set to Cancel                   | on      | scheduled cancel                                                                                   |
| Subscription Plan Changed / Paused / Resumed | on      | n/a for us mostly                                                                                  |
| Refund Successful                            | on      |                                                                                                    |
| License Key Created                          | on      | n/a                                                                                                |
| Add Payment Method Reminder                  | on      | card-less trial only; **no toggle**, timing via Settings → Subscriptions → Payment Method Reminder |
| Subscription On Hold, No Payment Method      | on      | card-less trial hit billing w/o card                                                               |

- **No card-expiring email.** Build ourselves if wanted: `GET /customers/{id}/payment-methods`
  returns `card.expiry_month/expiry_year` (SDK type `CustomerRetrievePaymentMethodsResponse`).
- Dunning (Settings → Recovery, **off by default**): up to 4 emails for `on_hold`/`past_due` and for
  portal-cancelled subs, custom subject/body, links to portal; webhooks `dunning.started`,
  `dunning.recovered`.
  [subscription-dunning](https://docs.dodopayments.com/features/recovery/subscription-dunning.md)
- Emails go only to the Dodo customer email (one owner). Test Mode sends real emails with
  `[TEST MODE]` subject, 100/week cap, separate toggle. Customer → Sent Emails tab shows log +
  resend. [email-logs](https://docs.dodopayments.com/features/email-logs.md)

## 5. Live API call vs webhook

Webhook events (SDK v2.62.0 `webhooks.d.ts`): `payment.succeeded|failed|processing|cancelled`,
`subscription.active|renewed|on_hold|past_due|cancelled|expired|failed|updated|plan_changed|paused|unpaused|update_payment_method`,
`refund.*`, `dispute.*`, `dunning.started|recovered`, `invoice.*` (invoice-led only). Payloads are
the full object (`payment.succeeded.data: Payment`, subscription events carry the Subscription),
"latest state at delivery time"; may arrive out of order.
[webhooks](https://docs.dodopayments.com/developer-resources/webhooks.md)

| Need                                                                                | Source                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Subscription status, `next_billing_date`, amount, `has_payment_method`, cancel flag | Webhook (store in D1); API refresh as fallback                |
| Payment receipt row (amount, `invoice_id`, card last4)                              | `payment.succeeded`/`failed` webhook                          |
| Invoice PDF bytes                                                                   | **Live API** `GET /invoices/payments/{payment_id}`            |
| Invoice/billing history list                                                        | Live API `payments.list` — or just link the portal            |
| Portal link                                                                         | **Live API** per click (24h)                                  |
| Checkout URL                                                                        | **Live API** per click (24h)                                  |
| Card expiry                                                                         | **Live API** payment-methods list (no webhook carries expiry) |
| Card last4 on subscription                                                          | Payment webhook (`card_last_four`) / payment-methods API      |

## Recommended split (vs map)

- Billing page (owner): status + days left + next charge (from D1), buttons [Add payment /
  Subscribe] → checkout or portal, [Manage billing] → portal, optional invoice list via
  `payments.list` w/ proxied PDF. Card update, cancel, invoices, address editing: **portal**.
- Dodo emails keep: receipt, cancelled/set-to-cancel. Decide on Trial Ending (T-2, single billing
  email) vs our T-3/T-1 to all owners → overlap; either turn Dodo's off or accept duplicate.
- Payment-failed: Dodo's toggles are off by default; our Resend email to all owners covers it.
  Dunning optional (it's single-recipient too).

## Open questions

- Card-less trial: does Dodo still send **Trial Ending** in addition to the non-toggleable **Add
  Payment Method Reminder**? Docs ambiguous → verify in Test Mode (Sent Emails tab).
- Does a card-less trial still require the customer to visit checkout (to create the subscription),
  or can server create it? → ticket 01/06.
- Invoice PDF endpoint marked `no_auth` with optional signed `token`; whether our business asks for
  credentials on invoice links (dashboard setting) — irrelevant if we proxy with API key.
