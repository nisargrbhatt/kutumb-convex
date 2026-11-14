# Dodo invoices, customer portal and native emails

Type: research Status: resolved Blocked by:

## Question

What can an owner see and do through Dodo-hosted surfaces vs what we must build? Cover: invoices
(per payment? PDF URL? listable per customer via API? any "upcoming invoice" / amount-due concept or
standalone invoice with a due date?), hosted checkout (session creation, return URL, prefilled
customer, discount codes), customer portal (session creation, what it offers: update card / mandate,
cancel, invoices, billing address; expiry of the link), and which emails Dodo sends to the customer
natively (receipt, renewal reminder, payment failed, trial ending, card expiring) and whether they
can be turned off. Note what needs a live API call vs what webhooks carry.

## Answer

Detail + citations: `.scratch/billing/research/dodo-invoices-portal-emails.md`.

- Invoices: auto PDF per **succeeded** payment only; `GET /invoices/payments/{payment_id}` (API key,
  proxy server-side); list via `payments.list({ customer_id | subscription_id })` (`invoice_id` on
  each). No upcoming/due invoice for checkout-led subs (upcoming-invoice API = invoice-led only) →
  "invoice due on" = UX over `next_billing_date` + `recurring_pre_tax_amount`.
- Checkout: `POST /checkouts`, 24h; `return_url` gets `subscription_id`,`status`; prefill
  `customer_id` or email (email-matching merges customers unless `always_create_new_customer`);
  `discount_codes`, `allow_discount_code:false`; `metadata`; card-less trial via product flag.
- Portal: `POST /customers/{id}/customer-portal/session` → `{link}`, 24h, `return_url`. Offers
  billing history + invoice download, update card (reactivates on_hold), retry payment, cancel (now
  / period end, separately toggleable), edit name + billing address. Per customer, not per
  subscription.
- Emails (toggleable): receipt on, trial-ending (~T-2) on, cancelled/set-to-cancel on, renewal
  reminder off, payment-failed off, renewal-failed off. Card-less trial "Add Payment Method
  Reminder" has **no toggle**. **No card-expiring email** (expiry via payment-methods API). Dunning
  optional. All go to the single customer email only.
- Webhooks carry full Payment/Subscription objects; live API needed for portal link, checkout URL,
  invoice PDF, card expiry.
