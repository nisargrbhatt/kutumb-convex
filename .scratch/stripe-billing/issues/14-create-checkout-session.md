# 14 — `createCheckoutSession` and the duplicate guard

Parent: [PRD.md](../PRD.md) §7.1, §7.2 Label: `impl` Status: `closed` Depends on:
[11](11-stripe-plugin-and-schema.md), [13](13-billing-status-and-gates.md)

## Goal

A server fn that returns a `client_secret` for an embedded Checkout session — reproducing the
plugin's undocumented metadata contract exactly, and refusing to mint a second subscription.

**This is the highest-risk slice in the plan.** Everything here was read off `@better-auth/stripe`'s
dist, not its docs.

## Scope

1. **Pure builder** (this is the tested seam):
   ```ts
   export function buildCheckoutSessionParams({
   	orgId,
   	userId,
   	subscriptionId,
   	priceId,
   	returnUrl,
   }): Stripe.Checkout.SessionCreateParams;
   ```
   ```ts
   {
     mode: "subscription",
     ui_mode: "embedded_page",
     customer,
     line_items: [{ price: priceId, quantity: 1 }],
     client_reference_id: orgId,
     metadata: { userId, subscriptionId, referenceId: orgId },
     subscription_data: { metadata: { userId, subscriptionId, referenceId: orgId } },
     return_url: `${origin}/onboarding/checkout?confirming=1`,
   }
   ```
   **Every one of these is load-bearing:**
   - `ui_mode: "embedded_page"` — **not `"embedded"`**, which was renamed in API `2026-03-25.dahlia`
     and now **fails** ([02](02-embedded-checkout-on-tanstack-workers.md)).
   - **No `success_url`/`cancel_url`** — illegal with an embedded `ui_mode`. No `customer_creation`
     (payment/setup mode only). No `trial_period_days`.
   - Drop `metadata.subscriptionId` → `checkout.session.completed` returns without touching the DB.
   - Drop it from `subscription_data.metadata` → `customer.subscription.created` creates a
     **second** row for the same org.
   - Only `subscription_data.metadata` reaches `customer.subscription.*`.
2. **`createCheckoutSession` server fn** (`src/api/billing.ts`), `authMiddleware`, org from
   `session.activeOrganizationId`:
   - **Owner-only check, inline** — it never passes through the plugin's `referenceMiddleware`, so
     it carries its own guard (PRD §7.4).
   - `ensureOrgStripeCustomer(orgId)` — lazy fallback, because
     [12](12-rip-out-polar-trial-and-seats.md)'s hook is best-effort.
   - Resolve/pre-create the `subscription` row per the guard table below, then call
     `stripe.checkout.sessions.create(buildCheckoutSessionParams(...))` and return `client_secret`.
3. **Duplicate guard** — Stripe has **no setting** that refuses a second subscription for the same
   customer + price. Look up rows by `referenceId = orgId`:

   | existing status                    | action                                          |
   | ---------------------------------- | ----------------------------------------------- |
   | _none_                             | create row `status: "incomplete"`, mint session |
   | `incomplete`, `incomplete_expired` | reuse the row, mint a fresh session             |
   | `canceled`                         | reuse the row, mint a fresh session             |
   | `active`, `trialing`               | **409**                                         |
   | `past_due`, `unpaid`               | **409**                                         |

   Row reuse matches the plugin's own `upgradeSubscription`. Checkout Sessions are **not** persisted
   or reused — a resumed checkout mints a fresh session against the reused row, so **no
   `stripeCheckoutSessionId` column**.

4. **Test** — vitest on `buildCheckoutSessionParams` alone: `mode`, `ui_mode`,
   `client_reference_id`, and **both** metadata bags. No Stripe, no network, runs in CI.

## Acceptance

- The unit test asserts all five contract points and fails if any metadata key is renamed.
- A fresh org gets a `client_secret`; an `active` org gets a 409.
- Reloading checkout twice produces **one** `incomplete` subscription row, not two.
- A member (non-owner) calling the fn is refused.

## Watch item

The metadata contract is **undocumented**. A `@better-auth/stripe` bump means re-reading its dist —
the unit test catches our regressions, not theirs ([01](01-better-auth-stripe-plugin-audit.md),
[05](05-checkout-architecture.md)).

## Comments

Done. `buildCheckoutSessionParams` extracted to `src/lib/checkout-session-params.ts`, not left inline
in `src/api/billing.ts` — same `cloudflare:workers`-poisons-vitest reason ticket 13 hit with
`billing-status-map.ts`; `billing.ts` imports `db`, so a co-located pure fn would be untestable
without a DB. 7 vitest cases cover the five contract points plus `customer`/`line_items`/`return_url`.

`ensureOrgStripeCustomer`'s Stripe-customer-creation call was near-duplicating
`afterCreateOrganization`'s (`src/lib/auth.ts`) — same `customers.create` + `stripeCustomerId`
persist, only the email/name lookup and failure handling differ (hook has the payload already and
swallows; the lazy fallback re-queries the owner via `member`→`user` and throws). Extracted the
shared create-and-persist step to `src/lib/org-stripe-customer.ts`, called from both.

`getMember` (`src/lib/auth.ts`) exported — was already exactly the owner-lookup §7.4 specifies,
just private; `createCheckoutSession` reuses it rather than re-querying `member` itself.

Duplicate guard: `BLOCKING_SUBSCRIPTION_STATUSES = active | trialing | past_due | unpaid` → 409;
anything else (no row, `incomplete`, `incomplete_expired`, `canceled`, and unlisted statuses like
`paused`) reuses/creates the row and mints a session — matches the guard table, and unlisted statuses
fall through to "reuse," matching the plugin's own `isActiveOrTrialing`-only gate on its upgrade path.

Server fn returns the bare `client_secret` string (not `{ clientSecret }`) — that's what
`@stripe/react-stripe-js`'s `fetchClientSecret` wants directly (ticket 15's job to wire up).

409 uses `setResponseStatus(409)` then `throw new Error(...)` — no `AppError`-style class exists in
this repo yet, and every other `src/api/*.ts` error path is a plain thrown `Error`, so kept it
consistent rather than introducing one for a single call site.
