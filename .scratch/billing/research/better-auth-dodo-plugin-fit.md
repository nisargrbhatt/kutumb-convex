# better-auth Dodo plugin fit for org billing

Ticket: `.scratch/billing/issues/02-better-auth-dodo-plugin-fit.md`. Researched 2026-11-13.

Sources (primary):

- Docs: https://better-auth.com/docs/plugins/dodopayments
- Plugin source: npm `@dodopayments/better-auth@1.6.7` (repo
  https://github.com/dodopayments/dodo-adapters, `packages/better-auth`), tarball `dist/*.js` read
  directly. Dep: `@dodopayments/core@0.3.16` (same repo, `packages/core`).
- SDK: npm `dodopayments@2.62.0` (https://github.com/dodopayments/dodopayments-typescript).
- Dodo API: https://docs.dodopayments.com/api-reference/customers/create-customer
- Project: `package.json` (better-auth ^1.7.7, zod ^4.4.3), `src/lib/auth.ts`, `wrangler.jsonc`.

## TL;DR

Plugin is **user-centric by construction**: one Dodo customer per **user email**, id stored on
`user.dodoCustomerId`; portal / list endpoints resolve customer from session user only. No org
awareness, no `referenceId` resolution, no subscription table. Only org hook: free-form
`referenceId` -> checkout `metadata.referenceId`. Fighting it for per-org billing costs more than it
saves. **Recommend: `dodopayments` SDK directly + own webhook route + own `organizationBilling`
table.** Optionally reuse `@dodopayments/core/webhook` (`verifyWebhookPayload`) or SDK
`client.webhooks.unwrap` for verification; both Workers-safe.

## What the plugin does (source-verified)

### Schema

Adds exactly one column: `user.dodoCustomerId` (string, optional, `input: false`). No subscription /
customer / org tables. Source: `dist/index.js` `schema.user.fields.dodoCustomerId`.

### Hooks

`init()` registers `databaseHooks.user.create.after` / `update.after` (`dist/chunk-527Y7FSE.js`),
active only when `createCustomerOnSignUp: true`:

- create: `customers.list({ email })` -> reuse `items[0]` or
  `customers.create({ email, name, metadata, phone_number }, { idempotencyKey: user.id })`; writes
  `dodoCustomerId` on user. Throws `APIError(500)` on Dodo failure -> **sign-up fails if Dodo is
  down**.
- update: pushes user `name` (+ `getCustomerParams(user)` metadata/phone) to Dodo customer.
- `getCustomerParams` receives the better-auth **User** only - no org context.

### Endpoints (all under better-auth basePath, so `/api/auth/dodopayments/...`)

| Endpoint                                                       | Sub-plugin   | Customer resolution                                                  |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------------- |
| `POST /dodopayments/checkout` (deprecated)                     | `checkout()` | body `customer` spread over session email/name                       |
| `POST /dodopayments/checkout-session`                          | `checkout()` | **session user email/name overrides body `customer`** when logged in |
| `GET /dodopayments/customer/portal`                            | `portal()`   | `getOrCreateCustomerId(session.user)`                                |
| `GET /dodopayments/customer/subscriptions/list`                | `portal()`   | same                                                                 |
| `GET /dodopayments/customer/payments/list`                     | `portal()`   | same                                                                 |
| `POST /dodopayments/usage/ingest`, `GET .../usage/meters/list` | `usage()`    | same                                                                 |
| `POST /dodopayments/webhooks`                                  | `webhooks()` | n/a                                                                  |

Sources: `dist/chunk-6VDYFSNJ.js` (checkout), `dist/chunk-YCUWFLKK.js` (portal),
`dist/chunk-EGRIWRWP.js` (`getOrCreateCustomerId`), `dist/chunk-ZA3TNX5K.js` (usage),
`dist/chunk-XXIDSJPK.js` (webhooks).

Notes from source:

- `checkout-session`: `customer: session?.user.email ? { email, name } : ctx.body.customer` - a
  logged-in caller **cannot** pass `{ customer_id: <org's customer> }`; it is replaced by the user's
  email. Dodo then attaches to existing customer by email (SDK `CheckoutSessionCreateParams`: "By
  default email is used to find an existing customer"; `always_create_new_customer` flag exists).
- `referenceId` -> `metadata.referenceId` (merged with body `metadata`). Body also passes through
  other session fields (e.g. `subscription_data.trial_period_days`) since schema extends
  `checkoutSessionPayloadSchema` (`@dodopayments/core/dist/chunk-IHA244I5.js`).
- **No authorization on `referenceId`**: any logged-in user may send any org id. Must be guarded by
  us (e.g. `hooks.before` matcher) - easy to forget.
- `products` / `slug` lookup + `authenticatedUsersOnly` - trivial to reimplement.
- Portal + list endpoints **require `user.emailVerified`** (401 otherwise). Project has
  `requireEmailVerification: false` (`src/lib/auth.ts`), so unverified owners get blocked.
- Portal is per Dodo customer = per user email -> an owner of 5 orgs sees **all 5 orgs'
  subscriptions** in one portal; customer name = user name, not org name. Conflicts with map
  decision "customer name = org name". Portal also lacks `return_url` (SDK
  `CustomerPortalCreateParams.return_url` is supported but plugin calls
  `customerPortal.create(customerId)` with no params).
- Env detection: `options.client.baseURL.includes("test")` - fine with `environment: "test_mode"`.

### Webhooks

- Route: `/api/auth/dodopayments/webhooks` (mounted via our `src/routes/api/auth/$.ts`).
- Verification: `@dodopayments/core` `verifyWebhookPayload` -> vendored Standard Webhooks
  `Webhook(webhookKey).verify(body, {webhook-id, webhook-timestamp, webhook-signature})`
  (HMAC-SHA256 via pure-JS `fast-sha256`, timing-safe compare, timestamp tolerance), then zod
  `WebhookPayloadSchema.safeParse` (`core/dist/chunk-CTZFUSJB.js`, `chunk-FYZWLFP7.js`,
  `chunk-F4N6VZ2P.js`).
- Routing: `handleWebhookPayload` calls `onPayload` + per-type handlers (`onSubscriptionActive`,
  `onSubscriptionOnHold`, `onSubscriptionRenewed`, `onSubscriptionCancelled`,
  `onSubscriptionFailed`, `onSubscriptionExpired`, `onSubscriptionUpdated`, `onPaymentSucceeded`,
  `onPaymentFailed`, `onDunningStarted`, `onDunningRecovered`, ...). Handlers get payload only -
  **no better-auth ctx / db**; org routing is ours (read `data.metadata.referenceId` / our own key,
  Subscription payload carries `metadata` and `customer`).
- Handler throw -> 400 (Dodo retries). **No idempotency / dedupe** by `webhook-id`: ours to add.
- Strict zod parse of known event types: a schema drift in a known payload -> 400 -> retries until a
  package bump. Unknown event types pass via `UnknownWebhookPayloadSchema`.
- Better-auth endpoint => subject to better-auth global behaviour (rate limiter, origin checks
  skipped since `isAction: false`; `cloneRequest: true`).

### Client

`dodopaymentsClient()` (`@dodopayments/better-auth/client`) only infers types:
`authClient.dodopayments.checkoutSession`, `.customer.portal`, `.customer.subscriptions.list`,
`.customer.payments.list`.

## Does it run on Workers?

Yes, both options.

- `dodopayments` SDK (Stainless): uses global `fetch` (`internal/shims.mjs` `getDefaultFetch`),
  `readEnv` guards `globalThis.process` (works with or without `nodejs_compat`); README lists
  "Cloudflare Workers" as supported runtime. Only dep `standardwebhooks` (deps `fast-sha256`,
  `@stablelib/base64`, pure JS). No `node:` imports in runtime code. Pass `bearerToken` explicitly
  from `env` (don't rely on `process.env`).
- `@dodopayments/core` / plugin: pure JS, imports `zod/v3` (provided by zod 4 - project has ^4.4.3),
  `better-auth/api`. Peer `better-auth ^1.4.0` ok with ^1.7.7.
- Project already has `nodejs_compat` + `global_fetch_strictly_public` (`wrangler.jsonc`); Dodo API
  hosts `test.dodopayments.com` / `live.dodopayments.com` are public, fine.

## Org-scoping the plugin: what it would take

| Need (map decisions)                             | Plugin                                 | Workaround                                                                                                                     |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Customer per org, name = org name, email = owner | No; per user email                     | Skip `createCustomerOnSignUp`; create customer ourselves in org-create hook; plugin endpoints would still pick user's customer |
| Checkout bound to org customer                   | No; session email overrides `customer` | Only `referenceId` metadata; customer still = user                                                                             |
| Only owners of that org can check out            | No                                     | `hooks.before` guard on `/dodopayments/checkout-session`                                                                       |
| Portal for org's subscription only               | No; per user                           | Not possible without own endpoint                                                                                              |
| Subscription state per org in DB                 | No table                               | Own table anyway                                                                                                               |
| Webhook -> org row                               | `onPayload` callback                   | Write handler ourselves anyway                                                                                                 |
| Trial w/o card                                   | Pass-through `subscription_data`       | Same in SDK                                                                                                                    |

Net: the only plugin pieces usable for org billing are the webhook signature wrapper and the
checkout slug->product mapping. Everything org-shaped (customer, portal, authz, state table,
idempotency) is ours either way, and the plugin's user-level endpoints + `user.dodoCustomerId`
become a footgun (exposed, wrong-scope routes any logged-in user can call).

## Direct SDK design sketch

- `src/lib/dodo.ts`:
  `new DodoPayments({ bearerToken: env.DODO_PAYMENTS_API_KEY, environment, webhookKey: env.DODO_PAYMENTS_WEBHOOK_SECRET })`.
- Table e.g. `organizationBilling` (orgId PK/FK, dodoCustomerId, dodoSubscriptionId, status,
  trialEndsAt, currentPeriodEnd, cancelAtPeriodEnd, graceUntil, updatedAt) + `billingWebhookEvent`
  (webhook-id PK for dedupe). Exact shape -> tickets 05/06.
- Server fns (`createServerFn` + `authMiddleware` + `assertCan` owner):
  - `startCheckout`:
    `checkoutSessions.create({ product_cart: [{ product_id, quantity: 1 }], customer: { customer_id: org.dodoCustomerId }, metadata: { organizationId }, return_url, subscription_data? })`
    -> `checkout_url`.
  - `openPortal`: `customers.customerPortal.create(org.dodoCustomerId, { return_url })` -> `link`.
  - Reads: `subscriptions.retrieve` / `payments.list({ customer_id })` / invoices as needed.
- Route `src/routes/api/dodo/webhook.ts` (server route, raw body):
  `client.webhooks.unwrap(raw, { headers })` (Standard Webhooks, same lib), dedupe on `webhook-id`,
  resolve org by `metadata.organizationId` (fallback `subscription_id` / `customer_id` lookup),
  update row, 200. Unit-testable pure reducer (event -> billing state).
- Org lifecycle (ticket 06): Dodo customer created at org create (or lazily at first checkout) via
  `customers.create({ email: owner, name: org.name, metadata: { organizationId } }, { idempotencyKey: orgId })`.
  Whether Dodo permits several customers with the same email via `customers.create` is not stated in
  the create-customer docs; checkout's `always_create_new_customer` flag implies duplicates are
  allowed. Verify in Test Mode (ticket 06).

## Trade-offs

|                     | Plugin                                                         | Direct SDK                                               |
| ------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Code to write       | Less for user-billing; ~same for org-billing                   | Checkout + portal fns (~50 LOC), webhook route (~40 LOC) |
| Org fit             | Poor (user customer, user portal, no authz)                    | Exact                                                    |
| Attack surface      | Extra user-scoped endpoints, `referenceId` unguarded           | Only what we expose, behind `assertCan`                  |
| Sign-up coupling    | Optional (`createCustomerOnSignUp`) but throws on Dodo failure | None                                                     |
| Email-verified gate | Hard-coded on portal/list                                      | Our choice                                               |
| Webhook verify      | Built-in                                                       | `client.webhooks.unwrap` (same Standard Webhooks lib)    |
| Typed payloads      | core zod schemas (strict)                                      | SDK TS types (`UnwrapWebhookEvent`), no runtime parse    |
| Upgrades            | Coupled to plugin + better-auth peer                           | SDK only                                                 |
| Workers             | OK                                                             | OK                                                       |

## Recommendation

Direct `dodopayments` SDK + own webhook server route + own billing tables, guarded by
`authMiddleware` + `assertCan` (owner). Do not install `@dodopayments/better-auth`. Optional: import
`@dodopayments/core/webhook` only if runtime zod validation of payloads is wanted; otherwise SDK
`webhooks.unwrap` suffices.

## Open questions

- Dodo: multiple customers same email via `customers.create` allowed? (verify Test Mode, ticket 06)
- Webhook route path: `/api/dodo/webhook` vs under `/api/auth`? (suggest outside better-auth)
- Runtime-validate payloads (core zod) or trust TS types?
