# 05 — Where the checkout session is created

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: ~~[01](01-better-auth-stripe-plugin-audit.md)~~,
~~[02](02-embedded-checkout-on-tanstack-workers.md)~~ (both closed) — **unblocked, on the frontier**

## Question

Embedded Checkout needs a `client_secret`. The `@better-auth/stripe` plugin may only hand back a
hosted Checkout URL. Settle the division of labour before anything is specced:

- ~~Does the plugin create the session~~ — **settled by [01](01-better-auth-stripe-plugin-audit.md):
  it cannot.** `upgradeSubscription` unconditionally sets `success_url`/`cancel_url`, which Stripe
  forbids alongside an embedded `ui_mode`, so the plugin can never return a `client_secret`. We own
  a `createCheckoutSession` server fn calling `stripe.checkout.sessions.create` directly; the plugin
  keeps webhooks, the subscription table and the portal.
- ~~Does the plugin still earn its place~~ — **yes, keep it.** It still carries the schema, the
  webhook endpoint, `referenceId`/`authorizeReference` tenancy and the billing portal. What is open
  is narrower: our hand-rolled session must reproduce the plugin's undocumented metadata contract
  (pre-create the `subscription` row as `status: "incomplete"`, set `client_reference_id`, stamp
  `{ userId, subscriptionId, referenceId }` on both `metadata` and `subscription_data.metadata`) or
  its `checkout.session.completed` handler will not reconcile. **Design that seam here** and decide
  how it gets pinned by a test.
- Write `authorizeReference` — the plugin _requires_ it and it is the tenancy boundary. Which roles
  may check out / open the portal for an org?
- Who creates the Stripe customer for an org, and when — an `afterCreateOrganization` hook mirroring
  today's Polar one, or Checkout itself?
- How does the org id reach the `customer.subscription.*` payload (`subscription_data.metadata`),
  and what does the webhook do if it is missing?
- Guard: can a member of an org that already has an active subscription reach checkout at all?

### Verification checklist inherited from [01](01-better-auth-stripe-plugin-audit.md)

AFK, do these before/while grilling — each is a one-shot check, not a decision:

- **`workerd` export condition.** The plugin passes no explicit `cryptoProvider` to
  `constructEventAsync`, so webhook signature verification only works if our Vite/wrangler build
  resolves stripe's `workerd` export condition to `WebPlatformFunctions` (SubtleCrypto). Confirm it
  does. If it does not, we pass a crypto provider ourselves — and that lands in the spec.
- **Embedded `ui_mode` literal.** `embedded_page` (API reference) vs `embedded` (plugin docs, older
  guides) is API-version-dependent. Pin the literal against the `apiVersion` we set.
- **`AuthorizeReferenceAction` union.** Enumerate it from the dist so `authorizeReference` handles
  every action, not just checkout.

## Answer

**We own checkout-session creation end to end; the plugin keeps webhooks, schema, tenancy and
portal.** Verified against `stripe@22.5.0` + `@better-auth/stripe@1.6.29` (scratch install, dist
read directly — none of this is documented).

### Verification checklist — all three resolved

- **`workerd` export condition — fine, no `cryptoProvider` needed.** `stripe`'s `exports` map
  declares a `workerd` condition resolving to `esm/stripe.esm.worker.js` (`WebPlatformFunctions`,
  SubtleCrypto). `@cloudflare/vite-plugin` resolves `workerd` for the worker environment, so the
  plugin's `constructEventAsync` verifies signatures as-is.
- **`ui_mode` literal is `embedded_page`** — confirmed by
  [02](02-embedded-checkout-on-tanstack-workers.md) against the `apiVersion` we set
  (`2026-03-25.dahlia`). `embedded` is the pre-rename value and fails. The plugin never sets
  `ui_mode` at all, so this is entirely ours.
- **`AuthorizeReferenceAction` is exactly five values:**
  `"upgrade-subscription" | "list-subscription" | "cancel-subscription" | "restore-subscription" | "billing-portal"`.
  Our `createCheckoutSession` is **not** among them — it never passes through the plugin's
  `referenceMiddleware`, so it carries its own guard.

### The metadata seam (read off `upgradeSubscription` in the dist)

`createCheckoutSession` must reproduce this or the plugin's `checkout.session.completed` handler
silently no-ops:

1. Resolve/pre-create the `subscription` row (see the status table below), giving us
   `subscription.id`.
2. `stripe.checkout.sessions.create({ mode: "subscription", ui_mode: "embedded_page", customer, line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }], client_reference_id: orgId, metadata: { userId, subscriptionId, referenceId: orgId }, subscription_data: { metadata: { userId, subscriptionId, referenceId: orgId } } })`.
   No `success_url` / `cancel_url` — Stripe forbids them with an embedded `ui_mode`.
3. Return `client_secret` to the client.

Two non-obvious facts that fall out of the dist:

- `checkout.session.completed` reads `client_reference_id || metadata.referenceId` **and**
  `metadata.subscriptionId`, and **updates** the pre-created row. Omit `subscriptionId` and it
  returns without touching the DB.
- `customer.subscription.created` dedupes on `metadata.subscriptionId`; without it on
  `subscription_data.metadata` it creates a **second** subscription row for the same org.
- The plugin's `resolvePlanItem` matches the line item's price id against a configured plan, so our
  single plan's `priceId` must equal `STRIPE_PRICE_ID`.

### Org Stripe customer — `afterCreateOrganization` hook

The plugin auto-creates Stripe customers for **users only** (`createCustomerOnSignUp`); for orgs it
creates them lazily inside `upgradeSubscription`, which we don't call. So it's ours.

Mirror today's Polar hook: `afterCreateOrganization` creates the Stripe customer
(`email: owner.email`, `name: org.name`, `metadata: { organizationId }`) and persists the id to
`organization.stripeCustomerId` — the column the plugin adds under
`organization: { enabled: true }`, and the one `findReferenceByStripeCustomerId` reads **first**.
Best-effort, never blocks org creation. Because it can fail, `createCheckoutSession` keeps an
assert-or-create fallback.

> Pre-empts part of [06](06-subscription-state-model.md): the customer id lives on
> `organization.stripeCustomerId`. `subscription.stripeCustomerId` is still written by the plugin —
> treat the org column as canonical.

### `authorizeReference` — owner only, inline role check

```ts
authorizeReference: async ({ user, referenceId }) =>
	(await getMember(user.id, referenceId))?.role === "owner";
```

All five actions, no per-action split. `createCheckoutSession` applies the same check itself. No new
`billing` statement in `src/lib/permission.ts` — deliberately kept out of the access-control layer.

### Duplicate-subscription guard

Stripe won't stop a second subscription; the guard is ours. `createCheckoutSession` looks up
`subscription` rows by `referenceId = orgId`:

| existing status                    | action                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| _none_                             | create row `status: "incomplete"`, mint session                                                             |
| `incomplete`, `incomplete_expired` | **reuse the row**, mint a fresh session                                                                     |
| `canceled`                         | reuse the row, mint a fresh session                                                                         |
| `active`, `trialing`               | reject (409) — client sends them to the dashboard                                                           |
| `past_due`, `unpaid`               | reject (409) — client sends them to the billing portal; dunning belongs there, not in a second subscription |

Row reuse matches the plugin's own `upgradeSubscription` behaviour. Stripe Checkout Sessions are
**not** persisted or reused — a resumed checkout always mints a fresh session against the reused
row, so no `stripeCheckoutSessionId` column is needed.

### Missing org id on a webhook — throw, let Stripe retry

Resolution order is already `client_reference_id` → `metadata.referenceId` →
`findReferenceByStripeCustomerId` (org column, then user). If all miss, **throw** so the webhook
returns non-2xx and Stripe retries with backoff for ~3 days.

Mechanically this needs our own check: the plugin's `onCheckoutSessionCompleted` wraps everything in
`try/catch` and swallows, so it will never 400 on its own. The guard goes in `onEvent`, which runs
**after** each built-in handler and whose throws do propagate to the endpoint's outer catch (→
`BAD_REQUEST`).

⚠️ Flagged: an event that can _never_ resolve (a subscription created straight from the Stripe
dashboard, an org deleted before its webhook landed) will retry for the full window and page us each
time. [07](07-webhook-lifecycle-and-org-deletion.md) owns the "org no longer exists" arm of this and
should decide whether that specific case is exempted into a logged 200.

### Test that pins the seam

Extract a **pure** `buildCheckoutSessionParams({ orgId, userId, subscriptionId, priceId })` and
assert its output in vitest — `mode`, `ui_mode: "embedded_page"`, `client_reference_id`, and both
metadata bags. No Stripe, no network, runs in CI. Catches our regressions; a plugin-side rename of
the metadata keys still slips through, so re-read the dist on any `@better-auth/stripe` bump
([01](01-better-auth-stripe-plugin-audit.md) established the versions move in lockstep with
`better-auth`).
