# Billing: spec

Per-organization **Subscription** through Dodo Payments: 15-day card-less **Trial**, $5/month,
invoices, payment details, cancel / re-subscribe, and **Lock**. Terms per `GLOSSARY.md`; Trial clock
per ADR 0013. Decisions and their reasons live in the wayfinder tickets
(`.scratch/billing/issues/01`–`12`); this spec states what to build.

## Constraints

- One Subscription per org, billed to the org. One Dodo customer per org (name = org name, email =
  one owner's). Single plan, Dodo product `Standard`.
- Any owner manages billing. Admins/members never see billing UI or prices.
- No better-auth Dodo plugin. `dodopayments` SDK directly + own webhook route + own tables.
- Dodo owns the Trial clock: the Trial is the Subscription's first period (ADR 0013).
- No live Dodo reads on the access path. D1 row mirrors Dodo; Lock is computed, never stored.
- No migration: DB wiped on merge.
- No support overrides, no coupons (`allow_discount_code: false`), no plan switching, no yearly.

## Config

| Name                        | Kind   | Value                                             |
| --------------------------- | ------ | ------------------------------------------------- |
| `DODO_PAYMENTS_API_KEY`     | secret | Dodo API key (test key locally / in preview)      |
| `DODO_PAYMENTS_WEBHOOK_KEY` | secret | `whsec_…` from the webhook endpoint               |
| `DODO_PAYMENTS_ENVIRONMENT` | secret | `test_mode` or `live_mode`                        |
| `DODO_PRODUCT_ID`           | secret | `pdt_0NrRhQONNdCc90vSRvBEo` (test); live id later |

`src/lib/dodo.ts`: one `DodoPayments({ bearerToken, environment, webhookKey })` per request
(Workers: no module-level env). Remove `PROBE_EMAIL` from `.dev.vars`. Regenerate
`worker-configuration.d.ts` (`npm run cf-typegen`).

## Data

`src/db/app-schema.ts`, enums in `src/db/constants.ts`.

### `orgBilling` (one row per org, cascade on org delete)

| Column                    | Notes                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `organizationId` PK       | FK `organization.id`                                                                  |
| `createdByUserId`         | org creator; analytics only                                                           |
| `country`                 | ISO-2 from create form; needed to retry sub creation                                  |
| `dodoCustomerId?`         | null only if customer create failed                                                   |
| `subscriptionId?`         | current sub only; replaced on re-subscribe                                            |
| `status?`                 | raw Dodo status (`DODO_SUBSCRIPTION_STATUSES`)                                        |
| `trialEndsAt`             | set once: `sub.created_at + trial_period_days`, or `org.createdAt + 15d` while no sub |
| `nextBillingDate?`        | from Dodo                                                                             |
| `cancelAtNextBillingDate` | bool                                                                                  |
| `pastDueEndsAt?`          | from `subscription.past_due` webhook only (GET lacks it)                              |
| `hasPaymentMethod`        | bool                                                                                  |
| `recurringPreTaxAmount?`  | cents; display only                                                                   |
| `needsSubscription`       | bool; true until a sub exists                                                         |
| `syncedAt`                | last pull from Dodo                                                                   |

### `billingWebhookEvent`

`webhookId` PK, `type`, `receivedAt`. Insert-or-ignore = dedupe.

### `billingNotice`

`(organizationId, kind, anchor)` unique, `sentAt`. `kind` ∈
`trial_t3 | trial_t1 | grace_start | grace_t2 | locked`. `anchor` = the deadline it is about
(`trialEndsAt`, `pastDueEndsAt`, lock date) as ISO string. Cascade on org delete.

## State: `billingAccess`

Pure, `src/domain/billing.ts`, client-safe, time injected:

```ts
billingAccess(row: OrgBillingRow, now: Date): {
	state: "pending" | "trialing" | "active" | "canceling" | "grace" | "locked";
	locked: boolean;
	lockReason?: "trial_ended" | "payment_failed" | "canceled";
	hasPaymentMethod: boolean;
	trialEndsAt: Date;
	trialDaysLeft?: number;   // trialing only, ceil
	graceEndsAt?: Date;       // grace only
	accessEndsAt?: Date;      // canceling only
	nextChargeAt?: Date;      // trialing+card, active
};
```

Rules, first match wins:

1. No sub (`needsSubscription`): `now < trialEndsAt` → `trialing`; else `locked/trial_ended`.
2. `pending` → `pending` (not locked).
3. `cancelled | expired | failed | paused` → `locked/canceled`.
4. `on_hold`: no card → `locked/trial_ended`; card → `locked/payment_failed`.
5. `past_due`: `now < pastDueEndsAt` → `grace`; else `locked/payment_failed`. Missing
   `pastDueEndsAt` → `grace` (Dodo moves it to `on_hold` at window end).
6. `active` + `cancelAtNextBillingDate`: `now < nextBillingDate` → `canceling` (wins over Trial);
   else `locked/canceled`.
7. `active`, `now < trialEndsAt` → `trialing`; else `active`.

Exhaustive unit tests (`billing.test.ts`): every rule, both sides of each date boundary, `trialing`
±card, cancel during Trial.

## Dodo calls

| Use                     | Call                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Create customer         | `customers.create({ name: orgName, email: creatorEmail, metadata: { organizationId } })`                                                                                                                                                    |
| Card-less Trial sub     | `POST /subscriptions` `{ customer: { customer_id }, product_id, quantity: 1, billing: { country }, payment_link: false, metadata: { organizationId } }` (deprecated in SDK; fine)                                                           |
| Pull state              | `subscriptions.retrieve(id)`                                                                                                                                                                                                                |
| Re-subscribe checkout   | `checkoutSessions.create({ product_cart: [{ product_id, quantity: 1 }], customer: { customer_id }, subscription_data: { trial_period_days: 0 }, metadata: { organizationId }, return_url, feature_flags: { allow_discount_code: false } })` |
| Portal                  | `customers.customerPortal.create(customerId, { return_url })` → `{ link }` (24h)                                                                                                                                                            |
| Payment method display  | `customers.retrievePaymentMethods(customerId)` → last4 + expiry                                                                                                                                                                             |
| Invoices                | `payments.list({ customer_id })`; PDF `GET /invoices/payments/{payment_id}`                                                                                                                                                                 |
| Cancel at period end    | `subscriptions.update(id, { cancel_at_next_billing_date: true })`; resume → `false`                                                                                                                                                         |
| Cancel now (org delete) | `subscriptions.update(id, { status: "cancelled" })`                                                                                                                                                                                         |
| Customer sync           | `customers.update(id, { name }                                                                                                                                                                                                              | { email })` |

Return URLs: `${BETTER_AUTH_URL}/settings/billing?from=dodo` (billing page) and
`${BETTER_AUTH_URL}/locked?from=dodo` (lock screen). `?from=dodo` → page calls `syncBillingFn` once
(pull + overwrite row), then drops the param.

## Org create

- Own server fn `createOrganizationFn` (`src/server/organization.ts`), replaces client
  `authClient.organization.create` in `OnboardingForm`. zod: name, slug (as today), `country`
  (required select, ISO-2 list).
- Steps: `auth.api.createOrganization` (ORG_LIMIT + hooks apply) → set active → insert `orgBilling`
  (`needsSubscription: true`, `trialEndsAt = org.createdAt + 15d`) → `ensureSubscription(orgId)`.
- `ensureSubscription` (`src/server/billing.ts`), idempotent, only does the missing step: no
  `dodoCustomerId` → create customer; no `subscriptionId` → create sub; then pull and write row
  (`needsSubscription: false`, `trialEndsAt` from sub). Never creates a second customer or sub. Dodo
  failure: `safeAsync`, log, org still created.
- Retries: owner billing page load, dashboard load (owner), hourly sweep.
- Fires `billing_trial_started` (org group, `createdByUserId`).
- Redirect to `/dashboard?trialStarted=1` → one-time **Trial started** dialog (owners only), param
  removed on close.

## Org changes → Dodo customer

All best-effort (`safeAsync`, log), in `auth` hooks:

- `afterUpdateOrganization` → customer `name`.
- Billing email: creator's at create. When the billing-email user stops being an owner (leave,
  removal, role change) → email of the longest-standing remaining owner (`member.createdAt`). Leave
  has no `afterRemoveMember`: hook the `after` middleware path in `src/lib/auth-hooks.ts`, as
  Connections do. Owner's own email change is not synced.
- `beforeDeleteOrganization`: sub live (not terminal, exists) → cancel now. Dodo error → throw
  ("Couldn't cancel the subscription, try again"). No sub / terminal → skip. Customer stays (no
  delete API). Row cascades.

## Webhook

Route `src/routes/api/billing/webhook.ts` (`POST /api/billing/webhook`), outside `/api/auth`, exempt
from Lock.

1. `client.webhooks.unwrap(await request.text(), { headers })`. Bad signature → 401.
2. Insert-or-ignore `billingWebhookEvent(webhook-id)`; duplicate → 200.
3. Handle `subscription.*` and `payment.*`; others → 200.
4. Org = `data.metadata.organizationId`, fallback lookup by `dodoCustomerId`. Unknown org → 200.
5. Ignore subs that are not the row's `subscriptionId` unless the row's current sub is terminal or
   absent (re-subscribe checkout) → then adopt the new id.
6. `subscriptions.retrieve(id)` → overwrite row (order-independent). `subscription.past_due` also
   stores `past_due_ends_at` from the payload.
7. Diff old vs new `billingAccess` → PostHog events + grace-start email (Reminders).

Dodo failure while pulling → 500 (Dodo retries 8× over ~32h). Keep handler fast; inline D1 writes.

## Lock enforcement

Default-deny. Lock is per org; the user can always switch org, sign out, create an org, accept
invites elsewhere.

- **`orgMiddleware`**: LEFT JOIN `orgBilling` into the existing member query;
  `billingAccess(row, now).locked` → `throw new AppError("Locked", lockReason)`. Add `orgBilling` to
  context.
- **`orgMiddlewareAllowLocked`**: same minus the check. Only for: billing read / sync / checkout /
  portal / resume / invoice PDF, delete org, transfer ownership, owner list for `/locked`.
- **`AppError` kind `"Locked"`**, `message` = `lockReason`. Global Query + mutation `onError` →
  `router.invalidate()`.
- **Route gate**: `_community.tsx` `beforeLoad` reads billing for active org → locked → redirect
  `/locked`. `/locked` (`src/routes/_authed/locked.tsx`, outside `_community`) redirects to
  `/dashboard` when not locked.
- **better-auth org hooks** under Lock: block `beforeCreateInvitation`, `beforeUpdateOrganization`,
  `beforeUpdateMemberRole` (unless actor is owner: transfer). Allowed: remove member / leave, cancel
  invitation, delete, set active, accept a pending invite into a locked org.
- **MCP**: `loadConnectionActor` joins `orgBilling`. Locked org still authenticates; `tools/list`
  works; every tool call → `isError` via `toolErrorResult` mapping `Locked`:
  `OrgLocked (<reason>): "<org>" is locked: <reason copy>. Its data is safe. Tell the user an owner must subscribe at <BETTER_AUTH_URL>/locked; retrying won't help.`
- **Blobs**: `blobRoute` GET + PUT on a locked org → 403.
- **OAuth**: select-org lists locked orgs disabled; `pickOauthOrgFn` refuses them.
- **Exempt**: `/api/auth/*`, `/api/billing/webhook`, `/api/ph`, `.well-known/*`, `/oauth/*` (minus
  above), `/onboarding/*`, `/login` etc.; server fns: org count, my invitations, my Connections
  (list / revoke / downgrade).

## UI

Prototype (Variant A) on local branch `prototype/billing-ux` (commit 4323a47, never merge):
`src/routes/_authed/_community/settings/billing-prototype/index.tsx`. Port layout and copy
(`headline()`, `lockCopy()`) verbatim. Price is always "$5/month + applicable tax" (from
`recurringPreTaxAmount`, pre-tax USD). Responsive mobile → ultrawide.

### Billing page `/settings/billing`

Owner-only (non-owner → redirect `/settings`). New SettingNav entry, owners only. Breadcrumbs
Settings → Billing. Single column `max-w-3xl`:

1. **Status card**: title + state badge + one-line body, Trial progress bar, one primary button:

   | State                   | Button                               | Action                 |
   | ----------------------- | ------------------------------------ | ---------------------- |
   | trialing, no card       | Add payment details                  | portal                 |
   | trialing + card, active | Manage payment                       | portal                 |
   | canceling               | Resume subscription                  | `resumeSubscriptionFn` |
   | grace                   | Update payment details (destructive) | portal                 |
   | pending                 | none ("Confirming your payment…")    | —                      |

   Locked orgs never reach this page (gate → `/locked`).

2. **Payment method** card (last4 + expiry, or "None added"; Add/Update → portal) and **Billing
   details** card (org name · country, receipt email), side by side from `md:`.
3. **Invoices** card: shadcn simple Table (date, amount, status, PDF link). PDF via
   `/api/billing/invoice/$paymentId` (owner of that org's customer only, streams Dodo PDF). Empty:
   "No invoices yet. Invoices appear here after each payment."
4. **Cancel zone** (`trialing | active` only), bordered destructive, button opens Dialog: "You keep
   access until <date>. Data is kept; re-subscribe any time." → `cancelSubscriptionFn`
   (`cancel_at_next_billing_date: true`).

Server fns (`src/server/billing.ts`, owner via `assertCan`, `orgMiddlewareAllowLocked`):
`getBillingFn` (row + `billingAccess` + payment method + invoices; runs `ensureSubscription` if
needed), `syncBillingFn`, `openPortalFn`, `startCheckoutFn`, `cancelSubscriptionFn`,
`resumeSubscriptionFn`. Portal / checkout fns return a URL; client does `window.location.assign`.
New permission statement `billing: ["manage"]`, owner only.

### Banner

Full-width strip above `_community` pages. Tone: info → warning at ≤3 Trial days → danger in grace.
Owner CTA on the right.

| Who    | State                      | Copy                                                                          | CTA            |
| ------ | -------------------------- | ----------------------------------------------------------------------------- | -------------- |
| Owner  | trialing, no card          | "<n> days left in trial · no charge unless you add payment details"           | Add payment    |
| Owner  | trialing + card            | "Trial · first charge $5 on <date>"                                           | —              |
| Owner  | pending                    | "Confirming your payment…"                                                    | —              |
| Owner  | canceling                  | "Subscription canceled · access until <date>"                                 | Resume         |
| Owner  | grace                      | "Payment failed · update payment details before <date> to avoid a lock"       | Update payment |
| Member | trialing, no card, ≤3 days | "<org>'s trial ends <date>. An owner (<names>) needs to add payment details." | —              |
| Member | grace                      | "Billing for <org> needs attention. Ask an owner (<names>)."                  | —              |

Active: no banner.

### Trial started dialog

"Your 15-day free trial has started"; body names org, end date, "No charge unless you add payment
details", "$5/month + applicable tax per organization"; [Later] [Add payment now → portal].

### Lock screen `/locked`

Centred card `max-w-md`: lock icon, title, body, "Your data is safe. Nothing is deleted while
locked.", actions, separator, Switch organization (`CommunityPicker`) / Create organization / Sign
out (`AuthUser`).

| Reason         | Title                     | Owner primary                                                               |
| -------------- | ------------------------- | --------------------------------------------------------------------------- |
| trial_ended    | Your free trial has ended | Subscribe · $5/month → portal (add card charges dues, `on_hold` → `active`) |
| payment_failed | Payment failed            | Update payment details → portal                                             |
| canceled       | Subscription ended        | Subscribe · $5/month → checkout (`trial_period_days: 0`)                    |

Owner also: Transfer ownership, Delete organization (ghost, Dialogs). Member: "<org> is locked. An
owner needs to subscribe|update the payment details… Owners: <names>." + Leave organization. Return
from Dodo shows "Confirming your payment…" until the row unlocks (poll `syncBillingFn` ≤ 30s, then
"Still processing; refresh in a minute").

## Reminders

Hourly `scheduled()` in `src/server.ts` (cron `0 * * * *`) runs `billingSweep` beside `blobSweep`.
Lock itself stays lazy. Emails via Resend + react-email (`src/emails/Billing*.tsx`), to **all
owners** at send time, one email each.

| Kind          | Trigger                                     | Copy gist                                                                          |
| ------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| `trial_t3`    | sweep, trialing, 3 days left                | no card: "add payment or <org> locks on <date>"; card: "first charge $5 on <date>" |
| `trial_t1`    | sweep, trialing, no card, 1 day left        | "add payment or <org> locks tomorrow"                                              |
| `grace_start` | webhook, state → `grace`                    | "payment failed, update before <date>"                                             |
| `grace_t2`    | sweep, grace, 2 days before `pastDueEndsAt` | "2 days left to update payment"                                                    |
| `locked`      | sweep, `locked`, once per Lock              | per `lockReason`; "data is safe"                                                   |

- Dedupe: insert-or-ignore `billingNotice`; send only if inserted. Send fails → delete row, next
  sweep retries.
- Missed windows: send only the latest due notice; never remind for a passed deadline.
- `locked` anchor = `trialEndsAt` (trial_ended), `pastDueEndsAt` or `syncedAt` (payment_failed),
  `nextBillingDate` or `syncedAt` (canceled). Fires `billing_locked`.
- Sweep also runs `ensureSubscription` for `needsSubscription` rows.
- No member emails. No email of ours on canceling (Dodo's covers it).

## Analytics

Server-side only (`src/lib/posthog-server.ts`), org group:

| Event                     | Fired from                                            |
| ------------------------- | ----------------------------------------------------- | -------- |
| `billing_trial_started`   | org create (`createdByUserId`)                        |
| `billing_checkout_opened` | `startCheckoutFn`, `openPortalFn` (`kind: checkout    | portal`) |
| `billing_subscribed`      | webhook diff: `hasPaymentMethod` false → true         |
| `billing_payment_failed`  | webhook diff: → `grace`, or → `locked/payment_failed` |
| `billing_canceled`        | webhook diff: → `canceling`                           |
| `billing_resubscribed`    | webhook: new sub adopted after terminal               |
| `billing_locked`          | sweep, with the `locked` notice                       |

## Local dev and testing

- `.dev.vars` with the four `DODO_*` values (test key, test product).
- Webhooks, faithful: `cloudflared tunnel --url http://localhost:3000`, register
  `https://<tunnel>/api/billing/webhook` as a **Test Mode** endpoint, its secret in `.dev.vars`.
  Quick but lossy: `dodo wh listen http://localhost:3000/api/billing/webhook` (re-serializes JSON;
  signature may fail), `dodo wh trigger <event> <url>` (unsigned; dev-only `unsafeUnwrap` behind
  `DODO_PAYMENTS_ENVIRONMENT === "test_mode"` and an explicit `DODO_WEBHOOK_UNSAFE=1`).
- Simulate Trial end / renewal: `PATCH /subscriptions/{id} { next_billing_date: <now+2min> }`.
- Cards (exp 06/32, CVV 123): success `4242424242424242`; renewal failure `4000000000000341` (exp
  12/34, succeeds at signup, declines next charge); decline `4000000000000002`.
- Test emails: Dodo Test Mode sends real `[TEST MODE]` emails, 100/week cap.
- Unit: `billingAccess` exhaustive; sweep notice selection (pure fn `dueNotices(row, now, sent)`);
  webhook adopt-or-ignore rule. Integration: webhook route with a signed fixture (`standardwebhooks`
  sign in test).

## Setup checklist (user)

### Test Mode (now)

1. Dodo dashboard → **Products** → `Standard` (`pdt_0NrRhQONNdCc90vSRvBEo`): confirm $5 USD/month,
   tax category SaaS, Trial 15 days, "Start the trial without a card" **on** (probe confirmed).
2. **Settings → Subscriptions**:
   - Subscription Grace Period: **on, 7 days**, after window → **On hold**.
   - Allow Immediate Cancellation (portal): **off**. Allow Cancellation at Next Billing Date:
     **on**.
   - Prevent Trial Misuse: **off** (one owner, many orgs, same email).
   - Pause, plan change, retention offer: **off**.
3. **Settings → Recovery**: Payment Retries **on**, standard schedule, recovery window **7 days**.
   Dunning **off**.
4. **Settings → Communication → Email → Customer Emails** (Test Mode toggle too):
   - Payment Succeeded (receipt): **on**. Subscription Cancelled: **on**. Set to Cancel: **on**.
   - Subscription Trial Ending: **off**. Upcoming Renewal Reminder: **off**. Payment Failed:
     **off**. Renewal Failed: **off**.
   - Subscription On Hold, No Payment Method: **off** (our Lock email covers it).
   - Add Payment Method Reminder: no toggle; accept.
5. **Developer → Webhooks → Add endpoint**: URL
   `https://<tunnel or preview host>/api/billing/webhook`. Events: `subscription.active`,
   `subscription.updated`, `subscription.renewed`, `subscription.past_due`, `subscription.on_hold`,
   `subscription.cancelled`, `subscription.expired`, `subscription.failed`,
   `subscription.update_payment_method`, `payment.succeeded`, `payment.failed`. Copy signing secret.
6. `.dev.vars`: set `DODO_PAYMENTS_WEBHOOK_KEY=whsec_…`, `DODO_PAYMENTS_ENVIRONMENT=test_mode`,
   `DODO_PRODUCT_ID=pdt_0NrRhQONNdCc90vSRvBEo`; keep `DODO_PAYMENTS_API_KEY`; delete `PROBE_EMAIL`.
7. `brew install cloudflared` (if missing). Run `npm run dev` +
   `cloudflared tunnel --url http://localhost:3000`; set `BETTER_AUTH_URL` to the tunnel URL while
   testing return URLs.
8. Business settings → brand name / support email as customers should see them on emails + portal.

### Live Mode (before launch)

1. Switch dashboard to Live; complete business verification / payouts.
2. Re-create product `Standard` (same settings) → note live `pdt_…`.
3. Repeat steps 2–5 above in Live (settings are per mode). Endpoint
   `https://<prod host>/api/billing/webhook`.
4. Live API key (Developer → API Keys).
5. Secrets:

```bash
npx wrangler secret put DODO_PAYMENTS_API_KEY
```

```bash
npx wrangler secret put DODO_PAYMENTS_WEBHOOK_KEY
```

```bash
npx wrangler secret put DODO_PAYMENTS_ENVIRONMENT
```

```bash
npx wrangler secret put DODO_PRODUCT_ID
```

(values: live key, live `whsec_…`, `live_mode`, live `pdt_…`). 6. Wipe D1 on merge (no migration),
apply migrations: `npm run migration:migrate:prod`.

### Probe leftovers

Test Mode customers `cus_0NrufShGuphTEdgi2NH1G`, `cus_0NrufSisdVIfp2WBSnsYS`, sub
`sub_0NrufSmnrfvscbsnu1Hfn` (Trial ends 2026-11-29). Optional: cancel the sub in the dashboard after
11-29 once you've checked which Dodo emails arrived.

## Not verified

- ~~`POST /subscriptions` with `billing: { country }` only~~ Verified 2026-11-14 (ticket 15, Test
  Mode, `sub_0Nrv6MoekvDTcM5CdgeYT` on probe customer `cus_0NrufShGuphTEdgi2NH1G`): accepted, `active`,
  `has_payment_method:false`, `trial_period_days:15`, next billing = created + 15d. Dodo echoed a
  stored zipcode from that customer's earlier probe address.
- Whether payment retries continue after grace → `on_hold` (docs: other statuses keep retrying).
  Harmless: a late success unlocks via webhook.
- Dodo "Add Payment Method Reminder" timing and content.

## Docs to update alongside

- `CLAUDE.md`: billing seam (`orgMiddleware` default-deny, `orgMiddlewareAllowLocked`), Dodo env.
- `GLOSSARY.md`: no new terms.
