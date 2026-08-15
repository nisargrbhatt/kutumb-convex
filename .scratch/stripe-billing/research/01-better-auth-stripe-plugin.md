# Research 01 — Can `@better-auth/stripe` carry our billing model?

Date: 2026-08-15. Ticket: `.scratch/stripe-billing/issues/01-better-auth-stripe-plugin-audit.md`

**Target model:** flat recurring monthly sub, compulsory checkout, no trial, org-scoped, Stripe
**embedded** Checkout (fixed), webhook-driven lifecycle, on Cloudflare Workers + D1/Drizzle,
better-auth `^1.6.14` with the organization plugin.

## Method / sources

Primary only:

- better-auth Stripe plugin docs — https://www.better-auth.com/docs/plugins/stripe
- Published plugin source, read directly from the npm tarball `@better-auth/stripe@1.6.29`
  (`package/dist/index.mjs`, `package/dist/index-Dkb8cZck.d.mts`). Line numbers below refer to that
  file. Version/peer data from `npm view @better-auth/stripe`.
- Published `stripe@22.5.0` tarball (`package/package.json`, `esm/platform/WebPlatformFunctions.js`,
  `esm/stripe.core.js`, `esm/Webhooks.js`).
- Stripe API reference — https://docs.stripe.com/api/checkout/sessions/create
- better-auth CLI docs — https://www.better-auth.com/docs/concepts/cli

Reading the shipped dist rather than GitHub `main` was deliberate: `main` is ahead of what we would
install, and the dist is exactly what runs.

---

## 1. Cloudflare Workers compatibility — PASS

**We supply the Stripe instance.** The plugin option is typed `stripeClient: Stripe`
(`index-Dkb8cZck.d.mts:421`) and every route uses `const client = options.stripeClient` — the plugin
never constructs its own Stripe instance. So an instance built with
`new Stripe(key, { httpClient: Stripe.createFetchHttpClient() })` is passed straight through.
`createFetchHttpClient` is a real static: `stripe.core.js:129` assigns
`Stripe.createFetchHttpClient = platformFunctions.createFetchHttpClient`.

**Webhook verification is async-first.** `index.mjs:1557-1559`:

```js
if (typeof client.webhooks.constructEventAsync === "function")
	event = await client.webhooks.constructEventAsync(payload, sig, webhookSecret);
else event = client.webhooks.constructEvent(payload, sig, webhookSecret);
```

`constructEventAsync` always exists on stripe-node ≥ v12, so the sync Node-crypto path is dead code
for us.

Note the plugin passes **no explicit `cryptoProvider`** (3 args only). `Webhooks.js:35` falls back
to `cryptoProvider || getCryptoProvider()`, i.e. `platformFunctions.createDefaultCryptoProvider()`.
That resolves correctly on Workers _because of the export condition_: `stripe@22.5.0` `package.json`
exports map has `"workerd"` and `"worker"` → `./esm/stripe.esm.worker.js`, which does
`Stripe.initialize(new WebPlatformFunctions())`, and `WebPlatformFunctions.js:31-33`:

```js
createDefaultCryptoProvider() { return this.createSubtleCryptoProvider(); }
```

→ SubtleCrypto (Web Crypto), not Node crypto. **Action item:** confirm our Vite/wrangler build
actually resolves the `workerd` condition. If it resolves `default` (Node build),
`createDefaultCryptoProvider()` returns the Node provider and webhook verification breaks — and the
plugin gives us no way to inject a crypto provider. `WebPlatformFunctions.js:19-28` also hard-throws
on `createNodeHttpClient()`/`createNodeCryptoProvider()`, so a misresolution fails loudly.

Reading the body: the webhook endpoint is declared `cloneRequest: true, disableBody: true` and does
`await ctx.request.text()` (`index.mjs:1547-1555`) — raw body preserved, which is what signature
verification needs.

## 2. Org-scoped subscriptions — PASS, and it is first-class

`referenceId` is the owning-entity column, defaulting to user id, and there is an explicit
`customerType: "organization"` mode. `referenceMiddleware` (`index.mjs:466-500`):

- `customerType === "organization"` → `authorizeReference` is **mandatory**; absent it throws
  `AUTHORIZE_REFERENCE_REQUIRED` (`:473-476`).
- referenceId defaults to `ctxSession.session.activeOrganizationId` when not passed explicitly
  (`:477`) — exactly our tenant key per `CLAUDE.md`.
- No `activeOrganizationId` and no explicit id → `ORGANIZATION_REFERENCE_ID_REQUIRED`.

`authorizeReference` signature (`index-Dkb8cZck.d.mts:372-377`):

```ts
authorizeReference?: (data: {
  user: User & Record<string, any>;
  session: Session & Record<string, any>;
  referenceId: string;
  action: AuthorizeReferenceAction;
}, ctx: GenericEndpointContext) => Promise<boolean>;
```

It must return `true`/`false`. `action` is the discriminator — observed values passed by the
middleware include `"billing-portal"` (`:1489`); the docs list "upgrade, cancel, restore, list"
actions. What it _must do_ for us: assert the caller is an active member of `referenceId` with
sufficient role (owner/admin for upgrade/cancel/portal). Per `CLAUDE.md` this means a server-side
`auth.api.hasPermission(...)` or a `member` table lookup — never trusting the client-sent
`referenceId`.

There is also `organization: { enabled: true }` (`index-Dkb8cZck.d.mts:462-482`) with
`getCustomerCreateParams` / after-create callback, which adds `stripeCustomerId` to the
`organization` table and makes the plugin create/sync a Stripe customer per org. The billing-portal
route reads `organization.stripeCustomerId` first, falling back to the active subscription row
(`:1497-1511`).

## 3. Checkout — **FAIL for embedded. This is the blocker.**

`upgradeSubscription` calls `client.checkout.sessions.create` (`index.mjs:1066-1108`) and
**unconditionally sets**:

```js
mode: "subscription",
success_url: getUrl(ctx, `${ctx.context.baseURL}/subscription/success?callbackURL=...&checkoutSessionId={CHECKOUT_SESSION_ID}`),
cancel_url: getUrl(ctx, ctx.body.cancelUrl),
```

`getCheckoutSessionParams` does let us inject extra params, but the destructure at `:1064` strips
`mode`, `customer`, `customer_email`, `success_url`, `cancel_url`, `line_items`,
`client_reference_id` from whatever we return, and the literals above are spread _after_
`...additionalParams` so they win regardless.

Stripe API reference (create Checkout Session):

> `success_url` … "This parameter is not allowed if ui_mode is `embedded_page` or `elements`."
> `cancel_url` … "This parameter is not allowed if ui_mode is `embedded_page` or `elements`."

So even though `ui_mode` would technically survive the destructure, setting it to the embedded value
makes Stripe reject the call because the plugin also sends `success_url` + `cancel_url`. There is no
plugin option to suppress them, and no `return_url` / `redirect_on_completion` plumbing anywhere in
the file (the only `return_url` occurrences, `:995/:1192/:1527`, are billing-portal ones).

**Plainly: `@better-auth/stripe` cannot produce an embedded-Checkout `client_secret`.** Embedded
checkout must be created by our own TanStack server fn calling
`stripe.checkout.sessions.create({ ui_mode: "embedded_page", return_url, mode: "subscription", ... })`
and returning `client_secret` to `<EmbeddedCheckoutProvider>`.

Small consolation: the endpoint returns the **whole session object** spread into the response
(`:1065-1117` — `{ ...await client.checkout.sessions.create(...), redirect }`), so `client_secret`
_would_ be relayed to the client if the session could ever be created embedded. It can't. The gate
is the forced `success_url`/`cancel_url`, not the response shape.

Also worth knowing for whatever we hand-roll: the plugin pre-creates a local `subscription` row with
`status: "incomplete"` before opening checkout (`:1035-1044`) and stamps
`metadata/subscription_data.metadata` with `{ userId, subscriptionId, referenceId }` plus
`client_reference_id: referenceId` (`:1094-1108`). That metadata is how its webhook handlers later
reconcile. Any hand-rolled session must reproduce it if we want the plugin's webhook half to work.

## 4. Subscription table — covers everything we need, CLI-generated

`index.mjs:1596-1662`, `subscription` model fields (better-auth field spec, in addition to the
implicit `id`/`createdAt`/`updatedAt`):

| field                                 | type    | notes                                                        |
| ------------------------------------- | ------- | ------------------------------------------------------------ |
| `plan`                                | string  | required; stored lowercased                                  |
| `referenceId`                         | string  | required — org id in our case                                |
| `stripeCustomerId`                    | string  | optional                                                     |
| `stripeSubscriptionId`                | string  | optional                                                     |
| `status`                              | string  | `defaultValue: "incomplete"`                                 |
| `periodStart`                         | date    | optional                                                     |
| `periodEnd`                           | date    | optional                                                     |
| `trialStart` / `trialEnd`             | date    | optional                                                     |
| `cancelAtPeriodEnd`                   | boolean | `defaultValue: false`                                        |
| `cancelAt` / `canceledAt` / `endedAt` | date    | optional                                                     |
| `seats`                               | number  | optional                                                     |
| `billingInterval`                     | string  | optional — `month` \| `year` from `price.recurring.interval` |
| `stripeScheduleId`                    | string  | optional — pending plan change via subscription schedule     |

Plus `user.stripeCustomerId` (`:1663-1666`), and `organization.stripeCustomerId` only when
`organization.enabled` (`:1667-1682`). `getSchema` gates the whole `subscription` model behind
`subscription.enabled`.

So yes: stripeCustomerId / stripeSubscriptionId / status / periodEnd / cancelAtPeriodEnd are all
covered out of the box.

**It does not pre-exist and it is not magic.** It is a better-auth schema declaration exposed as
`schema: getSchema(options)` on the plugin (`:1919`); the tables must be created by us. Per the
better-auth CLI docs, for Drizzle `generate` "goes to schema.ts in your project root" — i.e. it
emits Drizzle table definitions we then feed to `drizzle-kit` for the D1 migration. In our repo that
means merging into `src/db/auth-schema.ts`, then a normal D1 migration. Field/table names are
remappable via the plugin's `schema` option (`modelName` / `fields`).

## 5. Webhook coverage — 4 events handled, everything else via `onEvent`

`index.mjs:1566-1586`, the entire switch:

| event                           | handler                      | then             |
| ------------------------------- | ---------------------------- | ---------------- |
| `checkout.session.completed`    | `onCheckoutSessionCompleted` | `onEvent(event)` |
| `customer.subscription.created` | `onSubscriptionCreated`      | `onEvent(event)` |
| `customer.subscription.updated` | `onSubscriptionUpdated`      | `onEvent(event)` |
| `customer.subscription.deleted` | `onSubscriptionDeleted`      | `onEvent(event)` |
| _anything else_                 | —                            | `onEvent(event)` |

Confirms the docs' list. Notably **no `invoice.*` handling at all** — no `invoice.payment_failed` /
`invoice.paid`, so dunning and past_due UX are entirely ours (dunning does surface indirectly, since
Stripe flips `subscription.status` to `past_due`/`unpaid` and fires
`customer.subscription.updated`).

`onEvent` fires for **every** event including the four handled ones, and receives the raw
`Stripe.Event`. So `customer.subscription.paused`, `.resumed`, `.pending_update_applied`,
`.pending_update_expired` all reach `onEvent` untouched — the plugin does not model them, we handle
them ourselves there. (Note: none of those four write anything to the `subscription` row; if we want
paused state persisted, that is our code inside `onEvent`.)

User-facing hooks exposed (from `index.mjs` call sites + `.d.mts`): `onSubscriptionComplete` (:233),
`onSubscriptionCreated` (:246), `onSubscriptionUpdate` (:400) and internal `onSubscriptionUpdated`
(:320), `onSubscriptionCancel` (:394), `onSubscriptionDeleted` (:413), `onCustomerCreate` (:702),
and `onEvent` (:1569). Handler bodies swallow errors into
`ctx.context.logger.error("Stripe webhook failed…")` (`:457-459`, `:1587-1589`) — the endpoint
throws `BAD_REQUEST` on failure, so Stripe retries.

Endpoint path: `POST /stripe/webhook` under the better-auth base, i.e. `/api/auth/stripe/webhook`
for us (`index.mjs:1541`; matches the docs). It is `HIDE_METADATA`, so it sits outside the OpenAPI
surface.

## 6. Billing portal — YES

`createBillingPortal` → `POST /subscription/billing-portal` (`index.mjs:1483`), client
`authClient.subscription.billingPortal()`, server `auth.api.createBillingPortal`.

Body (`:1460-1480`): `returnUrl` (string, defaults `"/"`), optional `referenceId`, optional
`customerType: "user" | "organization"`, optional `locale`, `disableRedirect` (default `false`).
Middleware chain: `stripeSessionMiddleware`, `referenceMiddleware(options, "billing-portal")`,
`originCheck(ctx.body.returnUrl)` — so `returnUrl` must be a trusted origin.

What it needs to succeed: a resolvable `stripeCustomerId`. For orgs it reads
`organization.stripeCustomerId`, falling back to the `stripeCustomerId` on an active-or-trialing
`subscription` row for that `referenceId` (`:1497-1511`); if neither, `CUSTOMER_NOT_FOUND`
(`:1522`). It then calls `client.billingPortal.sessions.create({ locale, customer, return_url })`
and returns `{ url, redirect }` (`:1524-1532`). It does **not** set a portal `configuration`, so
behaviour comes from the default Customer Portal config in the Stripe dashboard.

Redirect-based only — fine, the portal has no embedded mode anyway.

## 7. Versions

`npm view @better-auth/stripe@1.6.14 peerDependencies`:

```json
{
	"stripe": "^18 || ^19 || ^20 || ^21 || ^22",
	"better-auth": "^1.6.14",
	"better-call": "1.3.5",
	"@better-auth/core": "^1.6.14"
}
```

The plugin is **version-locked in lockstep with better-auth** — `@better-auth/stripe@X` peers
`better-auth@^X`. So with `better-auth@^1.6.14` we take `@better-auth/stripe@1.6.14` (or bump both
together; current latest stable of both is `1.6.29`, `1.7.0-rc.6` is in flight). `better-call` is a
hard pin (`1.3.5` at 1.6.14, `1.4.0` at 1.6.29) — it must match whatever `better-auth` pulls, so do
not bump one package alone.

Stripe SDK: any of majors 18–22 satisfy the peer range; the docs install line says
`npm install @better-auth/stripe stripe@^22.0.0`, and stripe 22 is what has the `workerd` export
condition verified in §1. Take **`stripe@^22`**. Plugin runtime deps are only `zod@^4.3.6` and
`defu` — nothing Node-specific.

---

## Verdict — **adopt partially**

The plugin is a good fit on five of seven axes and a hard miss on the one that is non-negotiable.

**Take from the plugin:**

- The `subscription` schema (§4) — it is a superset of what we need; adopt it verbatim so we inherit
  the webhook handlers' write shape.
- The webhook endpoint + the four subscription handlers (§5). Async verification is correct for
  Workers, and it keeps the row in sync with Stripe without us writing reconciliation logic.
  `onEvent` gives us the escape hatch for paused/resumed/pending_update and for `invoice.*` dunning.
- `referenceId` + `customerType: "organization"` + `authorizeReference` (§2) — this is exactly our
  tenancy model and we should not reinvent it.
- The billing portal endpoint (§6) — zero-cost win.

**Hand-roll:**

- **Checkout session creation.** Our own TanStack server fn creating an embedded session and
  returning `client_secret`. It must stamp `client_reference_id: referenceId` and
  `metadata`/`subscription_data.metadata` = `{ userId, subscriptionId, referenceId }` and pre-create
  the `subscription` row as `status: "incomplete"`, mirroring `index.mjs:1035-1108`, or the plugin's
  `checkout.session.completed` handler will not find the row it wants to reconcile. That coupling to
  the plugin's undocumented metadata contract is the main risk of the partial-adoption path and
  should be pinned by an integration test.
- Dunning / `invoice.*` reactions, and any persistence of paused/resumed state — both via `onEvent`.

**Do not** hand-roll the whole thing: nothing else in §1/2/4/5/6 is a mismatch, and reimplementing
the webhook reconciliation is the expensive, bug-prone half.

## Could not verify

- The exact string literal for the embedded `ui_mode` value as accepted by the pinned API version.
  The current API reference enumerates `hosted_page` / `embedded_page` / `elements`, while the
  plugin docs and older Stripe guides use `hosted` / `embedded`. This is API-version-dependent — pin
  it against whatever `apiVersion` we set (docs example uses `"2026-06-24.dahlia"`) before writing
  the checkout server fn.
- Whether our Vite/wrangler config resolves stripe's `workerd` export condition (§1). Repo-local,
  not a docs question — verify by build inspection or a smoke-test webhook.
- The full enumeration of `AuthorizeReferenceAction` values. Docs say "upgrade, cancel, restore,
  list"; source confirms `"billing-portal"`. The union type is exported as
  `AuthorizeReferenceAction` — read it off the `.d.mts` at install time rather than trusting either
  list.
- Whether `@better-auth/stripe` ships D1/Drizzle-specific migration output, or whether the CLI's
  Drizzle `generate` needs manual merging into `src/db/auth-schema.ts`. The CLI docs only say it
  writes `schema.ts` at project root; our repo's layout differs, so expect manual merging.
