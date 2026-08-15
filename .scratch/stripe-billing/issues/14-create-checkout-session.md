# 14 — `createCheckoutSession` and the duplicate guard

Parent: [PRD.md](../PRD.md) §7.1, §7.2 Label: `impl` Status: `ready-for-agent` Depends on:
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
