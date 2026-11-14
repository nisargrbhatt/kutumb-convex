# Dodo Test Mode probe

Type: task Status: resolved Blocked by:

## Question

Facts the docs don't give, needed before state model and customer lifecycle can be decided. In Dodo
Test Mode (needs a test API key from the user; HITL if the agent can't get one): (1) can a card-less
trial subscription be created server-side at org create without the owner visiting checkout? (2) can
several customers share one email? (3) does a card-less trial get the "Trial Ending" email? (4)
confirm product `Standard` has "Start the trial without a card" on and the subscription period
setting. Record exact API calls + responses; delete nothing (no delete-customer API).

## Answer

Run 2026-11-14, Test Mode. Script `.scratch/billing/probe/probe.mjs`, raw responses
`.scratch/billing/probe/out.json` (key from `.dev.vars`).

1. **Card-less Trial server-side: yes.** `POST /subscriptions` with
   `{customer:{customer_id}, product_id, quantity:1, billing:{country,state,city,street,zipcode}, payment_link:false, metadata:{organizationId}}`
   → 200, `payment_method_required:false`, `payment_link:null`, plus a `payment_id` (likely $0 trial
   payment, not inspected). GET → `status:"active"`, `has_payment_method:false`,
   `payment_method_id:null`, `trial_period_days:15`, `previous_billing_date`=created,
   `next_billing_date`=created+15d, `expires_at`=+20y. No owner visit to checkout needed. Caveats:
   endpoint marked `@deprecated` in SDK; `billing` address was sent (dummy US) — whether it is
   required, and the tax effect of a dummy address, untested.
2. **Several customers per email: yes.** `POST /customers` twice, same email → two ids;
   `GET /customers?email=` lists both. Per-org customer is viable.
3. **Trial Ending email for card-less trial: unverified.** Probe sub `sub_0NrufSmnrfvscbsnu1Hfn`
   left live; its Trial ends 2026-11-29, so watch `PROBE_EMAIL` around 11-27 for "Trial Ending" and
   "Add Payment Method Reminder". Not blocking.
4. **Product confirmed** (`GET /products/{id}`): `trial_period_days:15`, `trial_type:"free"`,
   `trial_payment_method_optional:true`, `subscription_period` 20 Year, $5.00 USD/month,
   `tax_inclusive:false`, `purchasing_power_parity:false`.

Left in Test Mode: customers `cus_0NrufShGuphTEdgi2NH1G` (Probe Org A), `cus_0NrufSisdVIfp2WBSnsYS`
(Probe Org B), sub above. Side fact: `dodo wh listen <url>` / `dodo wh trigger <event> <url>`
forward webhooks to localhost (local dev story).
