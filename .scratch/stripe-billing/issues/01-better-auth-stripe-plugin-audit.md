# 01 — Better-auth Stripe plugin capability audit

Parent: [MAP.md](../MAP.md) Label: `wayfinder:research` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: _nothing_

## Question

Can `@better-auth/stripe` carry this billing model as configured, and what exactly does it give us?

Answer against primary sources (better-auth docs + the plugin source, Stripe docs):

1. **Workers compatibility.** Does it run on Cloudflare Workers — i.e. does it let us pass a
   `Stripe` instance constructed with `Stripe.createFetchHttpClient()`, and does its webhook
   verification use the async `constructEventAsync` (Node `crypto` sync verification will not work)?
2. **Org-scoped subscriptions.** Does `referenceId` let a subscription belong to an organization
   rather than a user, and what is `authorizeReference` expected to do? Confirm the shape with the
   organization plugin.
3. **Checkout.** What does its checkout endpoint create — a hosted Checkout Session URL only, or can
   it be configured `ui_mode: "embedded"` and return a `client_secret`? **Embedded Checkout is a
   fixed decision**, so if the plugin cannot produce a `client_secret`, say so plainly — that pushes
   checkout-session creation into our own server fn.
4. **Subscription table.** Exact columns of the schema the plugin adds, whether it is generated into
   our Drizzle schema or expected to exist, and whether it already covers stripeCustomerId /
   stripeSubscriptionId / status / periodEnd / cancelAtPeriodEnd. This is the "dedicated
   subscription table" the map decided on — we want the plugin's, not a parallel one.
5. **Webhook coverage.** Which of the seven events in the brief the plugin handles itself, which
   hooks it exposes (`onSubscriptionComplete`, `onSubscriptionUpdate`, `onSubscriptionDeleted`, …),
   and whether `onEvent` gives us the raw event for the ones it ignores (`paused`, `resumed`,
   `pending_update_applied`, `pending_update_expired`).
6. **Billing portal.** Does it expose a billing-portal session endpoint, and what does it need
   (customer id source, return URL)?
7. **Versions.** Which `@better-auth/stripe` version pairs with `better-auth@^1.6.14`, and which
   `stripe` node SDK major it expects.

## Answer

**Verdict: adopt PARTIALLY.** Keep the plugin's schema, webhook endpoint + handlers,
`referenceId`/`authorizeReference` tenancy, and billing portal. Hand-roll **only** embedded checkout
session creation, plus `invoice.*` and paused/resumed handling via `onEvent`.

Full findings, with line refs into `package/dist/index.mjs`:
[research/01-better-auth-stripe-plugin.md](../research/01-better-auth-stripe-plugin.md). Sourced
from the published tarball dist (not GitHub `main`, which is ahead of what we would install), the
`stripe@22.5.0` tarball, the plugin docs and the Stripe API reference.

1. **Workers — pass.** `stripeClient` is our own `Stripe` instance, passed through untouched, so
   `Stripe.createFetchHttpClient()` works. Webhook verification uses `constructEventAsync` where
   available (`index.mjs:1557-1559`); the sync Node-crypto path is dead code for us. **Caveat:** it
   passes no explicit `cryptoProvider`, so correctness rests on stripe's `workerd` export condition
   resolving to `WebPlatformFunctions` (→ SubtleCrypto). That is the one Workers risk and it is
   unverified — see the checklist added to [05](05-checkout-architecture.md).
2. **Org-scoped subscriptions — pass, first-class.** `customerType: "organization"` defaults
   `referenceId` to `session.activeOrganizationId` and **requires** `authorizeReference`, which
   returns a boolean from `{ user, session, referenceId, action }` and must do a server-side
   membership/role check. A separate `organization: { enabled: true }` adds an
   `organization.stripeCustomerId` column.
3. **Checkout — HARD FAIL. This is the blocker.** Hosted only. `upgradeSubscription` unconditionally
   sets `success_url` and `cancel_url` _after_ spreading our `getCheckoutSessionParams`, and
   Stripe's API reference states both are "not allowed if `ui_mode` is `embedded_page` or
   `elements`". **The plugin cannot produce a `client_secret`.** Session creation moves into our own
   server fn. Embedded checkout was a fixed decision, so this does not reopen; it just fixes the
   division of labour for [05](05-checkout-architecture.md).
4. **Subscription table — covers everything the map wanted.** Columns: `plan`, `referenceId`,
   `stripeCustomerId`, `stripeSubscriptionId`, `status` (default `"incomplete"`), `periodStart`,
   `periodEnd`, `trialStart`, `trialEnd`, `cancelAtPeriodEnd`, `cancelAt`, `canceledAt`, `endedAt`,
   `seats`, `billingInterval`, `stripeScheduleId`. Declared by the plugin, not expected to pre-exist
   — CLI-generated into our Drizzle schema, then a D1 migration. This **is** the map's "dedicated
   subscription table"; do not define a parallel one.
5. **Webhook coverage — 4 events only:** `checkout.session.completed`,
   `customer.subscription.created`, `.updated`, `.deleted`. **No `invoice.*` at all**, so dunning is
   ours. `onEvent` fires for _every_ event with the raw `Stripe.Event`, covering `paused`,
   `resumed`, `pending_update_applied`, `pending_update_expired`.
6. **Billing portal — yes.** `POST /subscription/billing-portal`, needs `returnUrl` (origin-checked)
   and a resolvable customer id (the org column, falling back to the active subscription row).
7. **Versions — lockstep.** `@better-auth/stripe@1.6.14` peers `better-auth@^1.6.14` and pins
   `better-call@1.3.5`; **never bump one alone.** Stripe node SDK: take `^22`.

### The coupling risk that partial adoption buys

Our hand-rolled session must reproduce the plugin's **undocumented metadata contract**, or the
plugin's `checkout.session.completed` handler will not find the row to reconcile:

- pre-create the `subscription` row with `status: "incomplete"`,
- set `client_reference_id: referenceId`,
- stamp both `metadata` and `subscription_data.metadata` with
  `{ userId, subscriptionId, referenceId }`.

This is the main hazard of partial adoption and should be pinned by an integration test.
[05](05-checkout-architecture.md) owns the design; [10](10-write-spec-and-impl-tickets.md) must
carry the test into the impl tickets.

### Could not verify

- The exact embedded `ui_mode` literal for our pinned `apiVersion` — the API reference says
  `embedded_page`, the plugin docs and older guides say `embedded`. It is API-version-dependent. →
  [02](02-embedded-checkout-on-tanstack-workers.md) / [05](05-checkout-architecture.md).
- Whether our Vite/wrangler config resolves stripe's `workerd` export condition. → checklist on
  [05](05-checkout-architecture.md).
- The full `AuthorizeReferenceAction` union.
