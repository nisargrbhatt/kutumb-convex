# 02 — Embedded Checkout inside TanStack Start on Workers

Parent: [MAP.md](../MAP.md) Label: `wayfinder:research` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: _nothing_

## Question

How does Stripe Embedded Checkout actually mount in this app?

1. **Packages.** `@stripe/stripe-js` + `@stripe/react-stripe-js` versions, and which component —
   `EmbeddedCheckoutProvider` + `EmbeddedCheckout`. `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` already
   exists — confirm how a `VITE_PUBLIC_*` var reaches the browser here (the PostHog vars are the
   precedent) rather than proposing a new one.
2. **SSR.** `loadStripe` and the embedded iframe are browser-only. Document the pattern that keeps
   TanStack Start SSR from breaking (client-only mount, `ssr: false` route option, or a
   `useEffect`-gated render) and which is idiomatic here.
3. **Session creation.** The exact `checkout.sessions.create` params for a flat recurring monthly
   subscription in embedded mode: `mode: "subscription"`, `ui_mode: "embedded"`,
   `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`, `return_url`, plus how to attach the
   organization id (`subscription_data.metadata` vs session `metadata` vs `client_reference_id`) so
   the webhook can resolve the org. Note which of those actually lands on the
   `customer.subscription.*` payloads — session metadata does **not**.
4. **Customer.** Whether to pre-create a Stripe customer per org (replacing today's Polar
   `afterCreateOrganization` hook) and pass `customer`, or let Checkout create one and read it back
   from the webhook.
5. **Return.** What `return_url` receives (`session_id={CHECKOUT_SESSION_ID}`) and the recommended
   post-return pattern — retrieve the session server-side to confirm, versus polling our own org
   status while the webhook lands (which is what `/onboarding/success` does today).
6. **Idempotency.** Preventing a second subscription when a user reloads the checkout page or clicks
   pay twice.

## Answer

Full findings: [research/02-embedded-checkout.md](../research/02-embedded-checkout.md).

**Two of this ticket's own assumptions were stale — read this first:**

- **`ui_mode: "embedded"` no longer exists.** API version `2026-03-25.dahlia` renamed
  `hosted`/`embedded`/`custom` → `hosted_page`/`embedded_page`/`elements`, and the old values now
  **fail**. `stripe-node` v21 and v22 both pin dahlia, so a fresh install gets this. Use
  **`ui_mode: "embedded_page"`**. Likewise `initEmbeddedCheckout()` →
  `createEmbeddedCheckoutPage()`. This closes the open item
  [01](01-better-auth-stripe-plugin-audit.md) could not verify.
- The brief's `line_items` shape and `mode: "subscription"` are still correct.

1. **Packages.** `stripe@22.5.0`, `@stripe/stripe-js@9.13.0`, `@stripe/react-stripe-js@6.8.1`. v6
   still exports `EmbeddedCheckoutProvider` / `EmbeddedCheckout`, but its source calls
   `createEmbeddedCheckoutPage`, so **react-stripe-js v6 requires stripe-js v9** — mixing majors is
   the likely footgun. It warns if `options` change after mount, so `fetchClientSecret` must be a
   stable `useCallback`.
2. **Env — no new mechanism needed.** Vite's default `envPrefix` is `VITE_`, which `VITE_PUBLIC_*`
   already matches, and `vite.config.ts` sets no override. Client reads
   `import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` (mirrors `__root.tsx:54`); server reads
   `env.STRIPE_SECRET_KEY` from `cloudflare:workers` (mirrors `src/lib/polar.ts`). Stripe's own
   Workers template constructs the client with **no** `httpClient` override and `nodejs_compat` is
   already enabled for us.
3. **SSR — use `ClientOnly`.** `@tanstack/react-router@1.170.15` already exports `ClientOnly` /
   `useHydrated` (a `useSyncExternalStore` hydration gate, no mismatch). **`ssr: false` is too
   blunt** — it disables `beforeLoad`/`loader` server-side, which would kill the `_authed` org gate,
   and it is inherited one-way down the tree; `'data-only'` is the middle-ground fallback. Keep
   `loadStripe` at module scope per Stripe's guidance.
4. **Session params.** `mode: "subscription"`, `ui_mode: "embedded_page"`,
   `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`, `customer`,
   `return_url: .../onboarding/success?session_id={CHECKOUT_SESSION_ID}`. `success_url`/`cancel_url`
   are **illegal** with `embedded_page` (today's Polar flow uses `successUrl` — it does not carry
   over). `customer_creation` is payment/setup-mode only — do not pass it. Omit `trial_period_days`.
5. **Metadata — this ticket's suspicion confirmed verbatim by Stripe.** Session `metadata` and
   `client_reference_id` appear **only** on `checkout.session.*`. **`subscription_data.metadata`**
   is what lands on the Subscription and therefore on `customer.subscription.*` (and on `invoice.*`
   as `subscription_details.metadata`). Set all three, plus `organizationId` on the Customer's own
   metadata as a third resolution path.
6. **Customer — pre-create per org**, replacing the Polar block at `src/lib/auth.ts:88-104`. Buys:
   customer exists before payment, no duplicate-customer litter, email prefilled and non-editable,
   portal works pre-payment. Stripe has **no `externalId` uniqueness** like Polar's, so guard with
   `idempotencyKey: org-customer:${orgId}` plus `metadata.organizationId`. The hook is best-effort,
   so also add a lazy `ensureOrgStripeCustomer(orgId)` at checkout time.
7. **Return — do both, don't choose.** Stripe is explicit that the return page cannot be the
   fulfilment trigger (the customer may never load it). Keep today's `/onboarding/success` polling
   shape; rename `checkout_id` → `session_id`; add a server fn wrapping `sessions.retrieve` and
   **authorize it** — compare `client_reference_id` against the active org, or it is a session-id
   oracle. Handle `status: "open"` → remount, `"complete"` → optimistic idempotent write. Replace
   the manual "Recheck" button with bounded auto-polling on `getOrgStatusQuery()`.
8. **Idempotency — three distinct hazards.** (a) Double-click → `{ idempotencyKey }` request option,
   stable per _intent_ not per render (Stripe prunes keys at 24h). (b) Reload re-mounts and re-calls
   `fetchClientSecret` → persist `checkoutSessionId` and reuse an `open`, unexpired session's
   `client_secret`. (c) The real guard → short-circuit on `resolveOrgStatus` + stored
   `subscriptionId`, and double-check `subscriptions.list({ customer, status: "active" })` before
   creating a session. **Stripe has no setting that refuses a second subscription for the same
   customer + price** — that check must live in our code.

### Deferred to [07](07-webhook-lifecycle-and-org-deletion.md)

Workers webhook verification specifics — `constructEventAsync` + `createSubtleCryptoProvider`, and
the `request.text()` body-reuse pitfall — are attested only by GitHub issue threads, not a
first-party doc. Pair this with the `workerd`-export-condition check on
[05](05-checkout-architecture.md); if that condition does not resolve, `createSubtleCryptoProvider`
is the fix.
