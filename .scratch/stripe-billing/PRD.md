# PRD — Polar → Stripe billing + email/password auth

Status: `ready-for-agent` Map: [MAP.md](MAP.md) · decided across tickets
[01](issues/01-better-auth-stripe-plugin-audit.md)–[09](issues/09-onboarding-flow-and-gates.md) Impl
issues: [`issues/11`](issues/11-stripe-plugin-and-schema.md) …
[`issues/21`](issues/21-analytics-and-stripe-test-mode-verification.md)

Every statement below was decided on a wayfinder ticket. Where a line is load-bearing it names the
ticket that owns it — **read that ticket before changing the behaviour**, not just this file.

## 1. Goal

Replace Polar with Stripe and open up email/password auth alongside Google.

- Flat recurring **monthly** Stripe subscription, one plan, one price (`STRIPE_PRICE_ID`).
- **Compulsory checkout, no trial.** An org is unusable until its subscription is `active`.
- **Stripe Embedded Checkout** mounted in-app, never a hosted redirect.
- Subscription lifecycle driven entirely by **webhooks**; the webhook is the sole writer.
- **Email/password** auth beside Google, with email verification and password reset.

Pre-launch app. **The dev/prod D1 may be cleared** — no data migration, no backfill, breaking
existing rows and flows is acceptable ([MAP.md](MAP.md) Notes).

## 2. Architecture in one page

| Concern                                                                                               | Owner                                    | Ticket                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Subscription schema, webhook endpoint + signature verification, `referenceId` tenancy, billing portal | `@better-auth/stripe` plugin             | [01](issues/01-better-auth-stripe-plugin-audit.md)                                           |
| Checkout session creation (`client_secret`)                                                           | **ours** — the plugin cannot produce one | [01](issues/01-better-auth-stripe-plugin-audit.md), [05](issues/05-checkout-architecture.md) |
| Org Stripe customer creation                                                                          | ours — `afterCreateOrganization` hook    | [05](issues/05-checkout-architecture.md)                                                     |
| Events the plugin ignores, org-resolution guard, org deletion                                         | ours — via `onEvent`                     | [07](issues/07-webhook-lifecycle-and-org-deletion.md)                                        |
| Billing status derivation                                                                             | ours — `resolveBillingStatus`, pure read | [06](issues/06-subscription-state-model.md)                                                  |

**Partial adoption is deliberate and it has one hazard:** our hand-rolled checkout session must
reproduce the plugin's _undocumented_ metadata contract (§6). A `@better-auth/stripe` bump means
re-reading its dist. Versions move in **lockstep with `better-auth` — never bump one alone**
([01](issues/01-better-auth-stripe-plugin-audit.md)).

## 3. Packages

Add: `stripe@^22` (22.5.0 verified), `@better-auth/stripe` (version matching installed
`better-auth`), `@stripe/stripe-js@^9`, `@stripe/react-stripe-js@^6`.

⚠️ **`@stripe/react-stripe-js` v6 requires `@stripe/stripe-js` v9** — its source calls
`createEmbeddedCheckoutPage`. Mixing majors is the likely footgun
([02](issues/02-embedded-checkout-on-tanstack-workers.md)).

Remove: `@polar-sh/better-auth`, `@polar-sh/sdk`, `@polar-sh/tanstack-start`.

Workers notes: construct `Stripe` with **no `httpClient` override** — `nodejs_compat` is already on,
and stripe's `workerd` export condition resolves to `WebPlatformFunctions` (SubtleCrypto), which is
why the plugin's `constructEventAsync` verifies signatures with **no `cryptoProvider`**
([05](issues/05-checkout-architecture.md) §verification).

## 4. Environment

**No new env vars.** All five Stripe vars are already declared in `worker-configuration.d.ts`:
`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PRODUCT_ID`, `STRIPE_WEBHOOK_SECRET`,
`VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

- `STRIPE_PRODUCT_ID` stays declared though embedded checkout consumes only the price id. Leave it.
- The publishable key needs **no new mechanism**: Vite's default `envPrefix` is `VITE_`, so the
  client reads `import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` exactly as `__root.tsx:54` reads
  the PostHog token ([02](issues/02-embedded-checkout-on-tanstack-workers.md)).
- Server reads `env.STRIPE_SECRET_KEY` from `cloudflare:workers`.
- **Delete** `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_MODE`, `POLAR_WEBHOOK_SECRET` and
  `TRIAL_DAYS` from the wrangler config/secrets, then `npm run cf-typegen`.

## 5. Data model

### 5.1 Subscription table — the plugin's, **verbatim**

CLI-generate the plugin's `subscription` table into `src/db/auth-schema.ts` unedited, then one D1
migration. **No columns added, no columns removed** ([06](issues/06-subscription-state-model.md)).

- `trialStart`, `trialEnd`, `seats`, `stripeScheduleId` sit unused and nullable. Dropping one turns
  an internal plugin write into a runtime SQL error, and the question returns on every version bump.
- **Index `subscription.referenceId`** — it is read on every gated request.
- `referenceId` = `organization.id` (`customerType: "organization"`).
- `subscription.stripeCustomerId` is a plugin-written **derived copy**. Never read it as the source.
- [07](issues/07-webhook-lifecycle-and-org-deletion.md) confirmed **no `lastEventAt`/ordering column
  is needed** — the handler is stateless (§7).

### 5.2 Org columns

- `organization: { enabled: true }` adds **`organization.stripeCustomerId`** — the **canonical**
  customer id, and the first thing `findReferenceByStripeCustomerId` reads
  ([05](issues/05-checkout-architecture.md)).
- **`session.active_organization_id` gains an FK** to `organization.id` with
  **`onDelete: "set null"`** (`src/db/auth-schema.ts:36`, an FK better-auth's generator omits). This
  is what makes org deletion safe: the pointer is cleared atomically, `_authed` then sees no active
  org and redirects to `/onboarding/create` before any billing read happens
  ([07](issues/07-webhook-lifecycle-and-org-deletion.md) §3,
  [04](issues/04-org-delete-cascade-audit.md)).

### 5.3 Org `metadata` is emptied

All four billing keys go: `status` and `trialEndsAt` die with the trial, `customerId` moves to
`organization.stripeCustomerId`, `subscriptionId` lives on the subscription row.

- **Delete** `OrgMetadata`, `parseOrgMetadata`, `mergeOrgMetadata`.
- **Keep** the `metadata` text column — better-auth's organization plugin owns it and it stays free
  for genuine non-billing config. `OnboardingForm` keeps writing `{}`.

### 5.4 Cascades

Every table keyed on `organization.id` cascades in Drizzle **and** in the emitted SQL, and D1
enforces FKs by default, so deleting an org needs **zero tables touched by hand**
([04](issues/04-org-delete-cascade-audit.md)).

## 6. Billing status — derived, never stored

`src/lib/org-status.ts` → **`src/lib/billing-status.ts`**:

```ts
export type BillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS];
export async function resolveBillingStatus(orgId: string): Promise<BillingStatus>;
```

`ORGANIZATION_STATUS` in `src/db/constants.ts` becomes
**`BILLING_STATUS = active | pending | past_due`**. `ResolvedOrgStatus`, `trialEndsAt`, `inTrial`,
`trialDaysLeft`, `getTrialDays` and `TRIAL_DAYS` are all deleted, along with the **lazy
write-on-read** — `resolveBillingStatus` is a **pure read** returning the bare status, not the row.

| `subscription.status` | App state  | Usable                                    |
| --------------------- | ---------- | ----------------------------------------- |
| _no row at all_       | `pending`  | no                                        |
| `incomplete`          | `pending`  | no                                        |
| `incomplete_expired`  | `pending`  | no                                        |
| `active`              | `active`   | **yes**                                   |
| `trialing`            | `active`   | **yes** (defensive — we create no trials) |
| `past_due`            | `past_due` | no                                        |
| `unpaid`              | `past_due` | no                                        |
| `paused`              | `pending`  | no                                        |
| `canceled`            | `pending`  | no                                        |

- **`past_due` blocks immediately.** Confirmed intentional against the recommended
  Stripe-retry-window alternative. Policy, settled — do not re-litigate
  ([06](issues/06-subscription-state-model.md) §3).
- `pending` and `past_due` earn separate names because the **CTA differs**: never-paid resumes
  checkout, lapsed goes to the billing portal.
- **Never cache this.** Not KV, not anywhere — a stale read either locks out a paying customer or
  admits an unpaid one. One indexed D1 read per gated request is cheap. The `KV` binding stays out
  of this path entirely ([06](issues/06-subscription-state-model.md) §6).
- **No missing-org degrade path.** The §5.2 FK means `resolveBillingStatus` never sees a deleted org
  ([07](issues/07-webhook-lifecycle-and-org-deletion.md) §3).

Domain vocabulary for `CONTEXT.md`: **billing status** (derived, never stored), **subscription row**
(single source of truth, one per org, written only by the webhook and by checkout creation),
**pending** (never completed a payment), **past due** (paid once, payment now failing).

## 7. Server surface

### 7.1 `createCheckoutSession` — ours

The plugin's `upgradeSubscription` unconditionally sets `success_url`/`cancel_url`, which Stripe
forbids alongside an embedded `ui_mode`, so **it can never return a `client_secret`**
([01](issues/01-better-auth-stripe-plugin-audit.md) §3).

**The metadata contract — reproduce it exactly or the plugin's `checkout.session.completed` handler
silently no-ops** ([05](issues/05-checkout-architecture.md), read off the dist):

1. Resolve/pre-create the `subscription` row (status table below) → `subscription.id`.
2. ```ts
   stripe.checkout.sessions.create({
   	mode: "subscription",
   	ui_mode: "embedded_page",
   	customer,
   	line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
   	client_reference_id: orgId,
   	metadata: { userId, subscriptionId, referenceId: orgId },
   	subscription_data: { metadata: { userId, subscriptionId, referenceId: orgId } },
   	return_url: `${origin}/onboarding/checkout?confirming=1`,
   });
   ```
3. Return `client_secret`.

Non-obvious, all three verified in the dist:

- **`ui_mode` is `"embedded_page"`, not `"embedded"`.** API version `2026-03-25.dahlia` renamed the
  values and the old ones **fail**; stripe-node v21/v22 both pin dahlia
  ([02](issues/02-embedded-checkout-on-tanstack-workers.md)).
- **No `success_url`/`cancel_url`** — illegal with an embedded `ui_mode`. Do not pass
  `customer_creation` (payment/setup mode only) or `trial_period_days`.
- Omit `metadata.subscriptionId` and `checkout.session.completed` returns without touching the DB;
  omit it from `subscription_data.metadata` and `customer.subscription.created` creates a **second**
  row for the same org.
- Only **`subscription_data.metadata`** reaches `customer.subscription.*`. Session `metadata` and
  `client_reference_id` appear only on `checkout.session.*`.
- The plugin's `resolvePlanItem` matches the line item's price against a configured plan, so the
  single plan's `priceId` **must equal `STRIPE_PRICE_ID`**.

**Duplicate-subscription guard is ours — Stripe has no setting that refuses a second subscription**
for the same customer + price:

| existing row                       | action                                                   |
| ---------------------------------- | -------------------------------------------------------- |
| _none_                             | create row `status: "incomplete"`, mint session          |
| `incomplete`, `incomplete_expired` | reuse the row, mint a fresh session                      |
| `canceled`                         | reuse the row, mint a fresh session                      |
| `active`, `trialing`               | reject **409** — client sends them to the dashboard      |
| `past_due`, `unpaid`               | reject **409** — client sends them to the billing portal |

Checkout Sessions are **not** persisted or reused — a resumed checkout mints a fresh session against
the reused row, so **no `stripeCheckoutSessionId` column**.

**Pinned by a test:** extract a pure
`buildCheckoutSessionParams({ orgId, userId, subscriptionId, priceId })` and assert `mode`,
`ui_mode`, `client_reference_id` and **both** metadata bags in vitest. No Stripe, no network. A
plugin-side rename still slips through — re-read the dist on any bump.

### 7.2 Org Stripe customer

`afterCreateOrganization` (replacing the Polar block at `src/lib/auth.ts:88-104`) creates the
customer — `email: owner.email`, `name: org.name`, `metadata: { organizationId }` — and persists it
to `organization.stripeCustomerId`. **Best-effort, never blocks org creation.** Stripe has no
`externalId` uniqueness like Polar's, so guard with `idempotencyKey: org-customer:${orgId}`. Because
the hook can fail, `createCheckoutSession` keeps a lazy `ensureOrgStripeCustomer(orgId)` fallback.

### 7.3 Webhook — stateless and idempotent

```ts
const sub = await stripe.subscriptions.retrieve(event.data.object.id);
await db.update(subscription).set(fromStripe(sub)).where(...);
```

Every subscription event **re-retrieves from Stripe and writes what it says**, so replayed and
out-of-order events write _current_ truth and ordering stops mattering by construction. One extra
Stripe call per event is the cheap side of the trade
([07](issues/07-webhook-lifecycle-and-org-deletion.md) §1).

- `pending_update_applied` / `pending_update_expired` / `paused` / `resumed` need **no branch** —
  the generic retrieve-and-write path covers them.
- **No `invoice.*` handlers at all.** `invoice.payment_failed` already moves the subscription to
  `past_due`, which fires `customer.subscription.updated`, which blocks the org. Subscribing to
  `invoice.*` adds a second redundant route to the same state. **Dunning needs no code** — Stripe's
  own emails plus the immediate in-app block are the whole feature
  ([07](issues/07-webhook-lifecycle-and-org-deletion.md) §5).
- **`paused` maps on `subscription.status` only. Never consult `pause_collection`** — it is a
  separate field, set manually, that leaves `status: "active"`. A paused-collection org therefore
  stays usable, which is the point of pausing collection. ⚠️ Easiest thing in this design to get
  backwards — verify it during impl.
- **`customer.subscription.deleted` deletes the org**, unconditionally and irreversibly. No grace
  window, no soft delete, and **no notification email** — deletion is silent from our side. Settled
  policy.
  ```ts
  await db.delete(organization).where(eq(organization.id, orgId));
  ```
  behind a named `deleteOrganizationCompletely(orgId)` seam. **Not** `auth.api.deleteOrganization` —
  the caller is Stripe, there is no session to authorize with, and forging one inside a webhook is
  worse than losing `beforeDeleteOrganization`/`afterDeleteOrganization` (nothing needs them today).
- **Org resolution failure → throw**, so the endpoint returns non-2xx and Stripe retries with
  backoff (~3 days). **One exemption: org-gone → `console.warn` + 200**, because after an
  unconditional deletion that is a terminal expected condition, not a transient failure
  ([05](issues/05-checkout-architecture.md), [07](issues/07-webhook-lifecycle-and-org-deletion.md)
  §6).
- Both guards live in **`onEvent`** — it runs after each built-in handler, and its throws propagate
  to the endpoint's outer catch (→ `BAD_REQUEST`). The plugin's own handlers wrap everything in
  `try/catch` and swallow, so a guard placed inside them can never 400.
- **We write no signature-verification code.** `STRIPE_WEBHOOK_SECRET` goes into the plugin config.

Stripe endpoint event selection: `checkout.session.completed` + the `customer.subscription.*`
lifecycle. Nothing else.

### 7.4 Tenancy

```ts
authorizeReference: async ({ user, referenceId }) =>
	(await getMember(user.id, referenceId))?.role === "owner";
```

**Owner only, all five actions**, no per-action split. The union is exactly
`"upgrade-subscription" | "list-subscription" | "cancel-subscription" | "restore-subscription" | "billing-portal"`.
`createCheckoutSession` never passes through the plugin's `referenceMiddleware`, so it applies the
**same check itself**. **No new `billing` statement in `src/lib/permission.ts`** — deliberately kept
out of the access-control layer ([05](issues/05-checkout-architecture.md)).

### 7.5 Billing portal

The plugin's `POST /subscription/billing-portal`. Needs `returnUrl` (origin-checked) and a
resolvable customer id. No route of ours.

## 8. Client surface

Source of truth for everything in this section:
**[prototypes/09-screens.md](prototypes/09-screens.md)** — wireframes, gate logic and copy strings
lift into the impl **verbatim**.

### 8.1 Routes

| Route                     | Purpose                                        |
| ------------------------- | ---------------------------------------------- |
| `/login`                  | password + Google                              |
| `/signup`                 | password + Google; invite-aware                |
| `/forgot-password`        | request reset                                  |
| `/reset-password`         | consume token — **the one genuinely new page** |
| `/onboarding/create`      | org details → creates org + Stripe customer    |
| `/onboarding/checkout`    | embedded checkout **and** the confirming state |
| `/onboarding/invitations` | unchanged                                      |
| `/payment-required`       | **`past_due` only** — billing portal CTA       |

**No `/verify-email` page** — better-auth self-redirects under `/api/auth/$`. **Deleted:
`/onboarding/success`** — embedded checkout produces no `checkout_id`, so its search param had
nothing to key on and its waiting-room job moved onto `/onboarding/checkout`.

### 8.2 Gates

```
_authed.tsx        no session              → /login?redirectTo=<pathname>
                   no activeOrganizationId
                     and not under /onboarding → /onboarding/create

_community.tsx     resolveBillingStatus(orgId):
                   active   → render CommunityLayout
                   pending  → redirect /onboarding/checkout
                   past_due → redirect /payment-required
```

Both billing routes carry **inverse guards** (`/payment-required`: `active` → `/dashboard`,
`pending` → `/onboarding/checkout`; `/onboarding/checkout`: `active` → `/dashboard`, `past_due` →
`/payment-required`, **except** while `?confirming=1` is present, where `active` is the success
path).

**No bounce loop:** a freshly created org is `pending` until the webhook lands, and `pending`
resolves to a route _outside_ `_community`, so nothing re-enters the gate.

`paymentMiddleware` (`src/middleware/payment.ts`) mirrors the same branch for server fns.

### 8.3 `/onboarding/checkout`

- `max-w-2xl` card in `RootLayout` (wider than the `max-w-sm` auth cards — the iframe needs room),
  full-bleed under `sm`, breadcrumbs `Home › Onboarding › Payment`. The iframe is `w-full`, height
  driven by Stripe, and must never force horizontal page scroll at 320px.
- Mounted inside TanStack's **`ClientOnly`** — **never `ssr: false`**, which disables
  `beforeLoad`/`loader` server-side and would kill the `_authed` org gate, and is inherited one-way
  down the tree ([02](issues/02-embedded-checkout-on-tanstack-workers.md)).
- `loadStripe` stays at **module scope**; `fetchClientSecret` must be a **stable `useCallback`** —
  react-stripe-js warns if `options` change after mount.
- Error state: replace the iframe with "We couldn't start checkout." + `[Try again]`. On a **409**
  specifically, refetch billing status instead — the org is already paid and the gate will move
  them.

### 8.4 `?confirming=1`

`useQuery(billingStatusQuery, { refetchInterval: 5000 })` — **the same DB read the gate uses**. The
webhook stays the sole writer.

The server-side `checkout.sessions.retrieve` alternative was **rejected**: it would either lie
(screen says paid while the gate says pending) or make the page a second writer to the subscription
row ([09](issues/09-onboarding-flow-and-gates.md)). On `active`: capture `payment_completed`,
success toast, navigate to `/dashboard`. `[Recheck]` is a manual `refetch()`. **No timeout cap.**

### 8.5 `/payment-required` and the portal link

`past_due` only: "Payment failed / We couldn't collect this month's payment for {org.name}. Update
your payment method to restore access." Single CTA → billing portal, **not** a second checkout. Keep
the **org switcher** — a user in multiple orgs must be able to leave a `past_due` org rather than be
trapped.

`PaymentRequiredBanner.tsx` is **deleted** along with its "Trial ended" copy and its
`authClient.checkout({ slug })` call. `AuthUser.tsx`'s `/api/polar/portal` link becomes **"Manage
billing"** in the same dropdown, **owners only** (matching §7.4).

### 8.6 Verify-email nag

Lives at the top of `CommunityLayout`, renders only when `session.user.emailVerified === false`.
Dismissible per session (`sessionStorage`), inline `[Resend]` with a **60s cooldown**. Because
billing states are full-page redirects outside `CommunityLayout`, the nag is **structurally
incapable** of stacking with one — no stacking rule needed.

### 8.7 Auth pages

All `max-w-sm` cards in `RootLayout`, matching today's `/login`. Separate routes, not a toggled card
— deep-linking matters for the invite flow.

| Trigger                          | Copy                                                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 422 email collision on signup    | "An account with this email already exists. Sign in instead, or continue with Google." + link                          |
| `"account not linked"` on Google | "This email is already registered with a password. Sign in with your password, then verify your email to link Google." |
| `BETTER_AUTH_DISABLE_SIGNUP` on  | Form replaced entirely: "Signups are closed. Kutumb isn't accepting new accounts right now." + link to `/login`        |
| Reset requested, any email       | Generic regardless: "If that email has a password account, we've sent a reset link."                                   |

**Invite entry.** Invite email → `/login?redirectTo=/onboarding/invitations&invitation=<id>`. Both
`redirectTo` **and** `invitation` are declared search params on `/login` **and** `/signup` and are
forwarded by the footer links, so either path lands on the invitation after auth. On
`/signup?invitation=<id>` the loader reads the invitation row server-side and renders the email
**prefilled and read-only**, so a created account can never mismatch the invited address and orphan
the invite. Invitees never touch checkout — accepting goes straight to `/dashboard`.

## 9. Auth config

```
emailAndPassword: {
  enabled: true,
  disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",   // mirrors the Google flag
  requireEmailVerification: false,
  autoSignIn: true,
  minPasswordLength: 8,      // better-auth defaults; max 128
  sendResetPassword: …,
},
emailVerification: { sendOnSignUp: true },
```

**Verification nags, it does not block** ([08](issues/08-auth-surface-decisions.md)). Checkout is
compulsory, so a verification wall would sit directly on the revenue path and hand deliverability a
veto over conversion — payment is the real identity proof. Signup goes straight to
`/onboarding/create` → checkout.

This **knowingly gives up** better-auth's enumeration-safe synthetic-user signup response: with
`requireEmailVerification: false`, credential signup on an existing email returns a plain **422**.
That is what the §8.7 collision copy needs. **This design accepts email enumeration end to end.**

### Account linking — three rules, do not relax any of them

- **No auto-link.** Credential signup on an existing email 422s; map it to the collision copy.
- **`trustedProviders` stays empty.** Google's `email_verified: true` already satisfies the linking
  check; adding Google would only buy a bypass of the local-verification guard below.
- 🔒 **`account.accountLinking.requireLocalEmailVerified` is left at its default `true` — never set
  it to `false`.** Verified in installed source (`better-auth/dist/oauth2/link-account.mjs:21-22`).
  This default is **the only thing** closing the pre-registration takeover vector that nag-mode
  verification would otherwise open: an attacker registering an unverified password account on a
  victim's email does not get linked when the victim later signs in with Google. **⚠️ UPGRADE WATCH
  ITEM — this is a version-pinned guarantee. Any `better-auth` upgrade must re-verify that this
  default has not flipped.**

Its accepted price is a UX cliff: a legitimate password user who ignores the nag and later clicks
"Continue with Google" gets `"account not linked"`, caught on the OAuth callback and mapped to the
§8.7 copy.

**Password reset lets a Google-only user set a password — accepted, not gated.** The link goes to a
mailbox they already control, and it is the only escape hatch if they lose Google access.

**`BETTER_AUTH_DISABLE_SIGNUP` is a single kill switch across both providers, and it is absolute —
no invite exemption.** While it is on, an invitee **without** an account cannot proceed; existing
users accept invites normally. This is the accepted cost of a zero-bypass-surface emergency stop and
must be **documented as a known limitation, not filed as a bug**
([09](issues/09-onboarding-flow-and-gates.md)).

### Password hashing — nothing to do

`@better-auth/utils` ships a `workerd` export condition routing to native `node:crypto` scrypt,
confirmed in our own committed build output. **No custom `password.hash`/`verify`.** Params are
`N=16384, r=16` (~33MB per hash against a 128MB isolate) — a **concurrency watch item**, and the
reason for the deployed timing test in §11.

### Rate limiting — the real cost of opening password login

The repo configures **no `rateLimit` and no `secondaryStorage`**, so production runs per-isolate
memory storage — near-useless on Workers. Google-only login masked this; a public password login
does not.

Point **only the rate limiter** at KV with a `get`/`set` shim over the existing `KV` binding
(`rateLimit.customStorage`). **Explicitly not `secondaryStorage`** — that also relocates session
storage, putting eventual consistency on every request and on logout/session revocation, a blast
radius far wider than the problem. Accepted cost: KV eventual consistency lets an attacker get a few
extra tries across colos — fine for brute-force defence.

## 10. Emails

Exactly **two new** react-email templates, built to `src/emails/InviteEmail.tsx`'s shape (`Tailwind`

- `pixelBasedPreset`, single `Button` CTA, URL also rendered as plain text):

**`VerifyEmail.tsx`** — subject "Verify your email for Kutumb". Body: "Confirm this address so we
can reach you about your Kutumb account." CTA `[Verify email]`. Footer: "This link expires in 1
hour. If you didn't create a Kutumb account, you can ignore this email."

**`ResetPasswordEmail.tsx`** — subject "Reset your Kutumb password". Body: "Someone asked to reset
the password for this account. If that was you, choose a new one." CTA `[Reset password]`. Footer:
"This link expires in 1 hour. If you didn't ask for this, you can safely ignore this email — your
password won't change."

**No billing emails, on lapse or on deletion**
([07](issues/07-webhook-lifecycle-and-org-deletion.md) §8). Stripe's dashboard-configured emails
cover failed charges and cancellation; the in-app state is the rest.

Client-call gotcha: `forgetPassword` is superseded by **`requestPasswordReset`**, and it takes
**`redirectTo`** while everything else takes `callbackURL`.

## 11. Analytics

Keep the existing names; the app already emits `payment_completed` and `sign_in_initiated`.

| Event                       | Where                                                  | Props                                                                     |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `payment_completed`         | `/onboarding/checkout` confirming, on flip to `active` | `{ organization_id }` (**no `checkout_id`** — embedded checkout has none) |
| `checkout_started`          | `/onboarding/checkout`, on client secret received      | `{ organization_id }`                                                     |
| `sign_in_initiated`         | `/login`                                               | `{ provider: "google" \| "password" }`                                    |
| `sign_up_initiated`         | `/signup`                                              | `{ provider: "google" \| "password" }`                                    |
| `password_reset_requested`  | `/forgot-password`                                     | `{}`                                                                      |
| `password_reset_completed`  | `/reset-password`                                      | `{}`                                                                      |
| `verification_email_resent` | nag `[Resend]`                                         | `{}`                                                                      |
| `billing_portal_opened`     | `AuthUser` + `/payment-required`                       | `{ source }`                                                              |

`organization_created`, `organization_create_failed`, `invitation_accepted`, `invitation_rejected`
and the member/profile events are untouched.

## 12. Removal inventory

Delete outright:

- `src/lib/polar.ts`
- `src/routes/api/polar/portal.ts`
- `src/routes/_authed/onboarding/success/index.tsx`
- `src/routes/_authed/-components/PaymentRequiredBanner.tsx`
- `src/lib/org-status.ts` (→ `src/lib/billing-status.ts`)
- the `polar()` plugin block in `src/lib/auth.ts` (`:256-335`) — checkout, portal, usage, all four
  webhook handlers
- `polarClient()` in `src/lib/auth-client.ts`
- the portal link in `src/components/CommunityLayout/AuthUser.tsx`
- deps `@polar-sh/better-auth`, `@polar-sh/sdk`, `@polar-sh/tanstack-start`
- env `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_MODE`, `POLAR_WEBHOOK_SECRET`, `TRIAL_DAYS`

**Trial machinery:** `beforeCreateOrganization`'s trial stamp, `getTrialDays`, `TRIAL_DAYS`,
`trialEndsAt`, `inTrial`, `trialDaysLeft`, the lazy write-on-read, and every trial string in the UI.

**Seat metering:** the `usage()` block and the `org_seat` `events.ingest` calls in
`afterRemoveMember`, `afterAcceptInvitation` and the commented-out `afterAddMember`. Delete the
commented block too — it exists only to explain a Polar quirk.

`ORGANIZATION_STATUS` → `BILLING_STATUS` (`src/db/constants.ts`), gaining `past_due`.

**`grep -ri polar src/` must return only `src/components/ui/chart.tsx` (a Recharts
`PolarAngleAxis`), `src/routes/(public)/privacy-policy/index.tsx` (prose — update it to name Stripe)
and `routeTree.gen.ts` (regenerated).**

Consumers of `resolveOrgStatus` to update (6 call sites): `src/middleware/payment.ts`,
`src/api/organization.ts`, `src/routes/_authed/_community.tsx`,
`src/routes/_authed/payment-required.tsx`, `src/routes/_authed/onboarding/success/index.tsx`,
`src/lib/auth.ts` (lines 80, 283, 298, 301, 315 — all metadata status writes, all deleted).

## 13. Verification

There is **no automated billing test harness in this repo** and this spec does not add one beyond
the pure params test. Verification is manual against Stripe **test mode**.

**Automated:** `buildCheckoutSessionParams` unit test (§7.1).

**Deployed timing test — a precondition on the auth impl ticket**
([03](issues/03-email-password-auth-research.md) could not verify it): time `POST /sign-up/email` on
a **deployed** Worker to close two open questions — does workerd's scrypt run off-thread, and what
is real latency at `r=16`? If it is slow enough to threaten the isolate under concurrency, that is a
finding to raise before shipping, not after.

**Manual, `stripe listen` + `stripe trigger`:**

1. `checkout.session.completed` → subscription row flips `incomplete` → `active`, org usable.
2. `customer.subscription.created` → **exactly one** row for the org (the dedupe on
   `metadata.subscriptionId` is what this proves).
3. `customer.subscription.updated` → `past_due` → org blocked, `/payment-required` shown.
4. `customer.subscription.updated` → back to `active` → org usable again.
5. `customer.subscription.deleted` → org row gone, all children cascaded, and every member's
   `session.active_organization_id` **nulled** rather than dangling.
6. Replay any of the above → same end state (idempotency).
7. Event for a deleted org → **logged 200**, no retry storm.
8. **Dashboard `pause_collection`** on an active subscription → `status` stays `active` and the org
   **stays usable**. ⚠️ The single easiest thing here to get backwards.
9. Duplicate guard: reach `/onboarding/checkout` with an `active` subscription → 409, redirected to
   the dashboard.

## 14. Known limitations (accepted, documented, not bugs)

- Org deletion on `customer.subscription.deleted` is unconditional, irreversible and silent.
- Email enumeration is accepted on signup (generic copy retained on password reset only).
- `BETTER_AUTH_DISABLE_SIGNUP` breaks invites for users without accounts.
- An unverified password user clicking "Continue with Google" hits a hard `"account not linked"`
  error until they verify.
- KV rate-limit storage is eventually consistent across colos.
