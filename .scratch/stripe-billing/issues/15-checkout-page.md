# 15 — `/onboarding/checkout`: embedded checkout and the confirming state

Parent: [PRD.md](../PRD.md) §8.3, §8.4 · wireframes:
[prototypes/09-screens.md](../prototypes/09-screens.md) Label: `impl` Status: `closed` Depends on:
[14](14-create-checkout-session.md)

## Goal

One self-confirming route: it mounts the Stripe iframe, and Stripe's `return_url` points back at
itself as `?confirming=1`, which swaps the iframe for a spinner that polls until the webhook lands.

## Scope

1. **New route `src/routes/_authed/onboarding/checkout/index.tsx`.**
   - Inverse guard: `active` → `/dashboard`, `past_due` → `/payment-required`. **Exception:** while
     `?confirming=1` is present, `active` is the success path (toast → `/dashboard`), not a bare
     redirect.
   - `max-w-2xl` card in `RootLayout` — wider than the `max-w-sm` auth cards, the iframe needs the
     room. Full-bleed under `sm`, centred with generous gutters at `2xl`+. Breadcrumbs
     `Home › Onboarding › Payment`. Iframe `w-full`, height driven by Stripe, and it **must never
     force horizontal page scroll at 320px**.
   - Copy: "Start your Kutumb subscription — ₹X / month for {org.name}. Cancel any time from billing
     settings."
2. **Mount pattern** — non-negotiable, all three from
   [02](02-embedded-checkout-on-tanstack-workers.md):
   - Wrap in TanStack's **`ClientOnly`**. **Never `ssr: false`** — it disables `beforeLoad`/`loader`
     server-side, which would kill the `_authed` org gate, and it is inherited one-way down the
     tree.
   - `loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY)` at **module scope**.
   - `fetchClientSecret` must be a **stable `useCallback`** — react-stripe-js warns if `options`
     change after mount.
   - `EmbeddedCheckoutProvider` + `EmbeddedCheckout` from `@stripe/react-stripe-js`.
3. **Confirming state** (`?confirming=1`): `useQuery(billingStatusQuery, { refetchInterval: 5000 })`
   — **the same DB read the gate uses**. On `active`: capture `payment_completed`, success toast,
   `navigate({ to: "/dashboard" })`. `[Recheck]` = manual `refetch()`. **No timeout cap** — it polls
   until it flips. 🚫 **Do not** call `checkout.sessions.retrieve` here. It was explicitly rejected:
   it would either lie (screen says paid while the gate says pending) or make this page a second
   writer to the subscription row, contradicting the webhook-is-sole-writer design
   ([09](09-onboarding-flow-and-gates.md)).
4. **Error state:** replace the iframe with "We couldn't start checkout." + `[Try again]`. On a
   **409** from [14](14-create-checkout-session.md), refetch billing status instead — the org is
   already paid and the gate will move them.
5. **Delete `src/routes/_authed/onboarding/success/index.tsx`.** Embedded checkout produces no
   `checkout_id`, so its search param had nothing to key on; its waiting-room job is now this
   route's.
6. Analytics: `checkout_started` on client secret received, `payment_completed` on the flip (PRD
   §11).

## Acceptance

- Fresh org → `/onboarding/create` → this route renders the Stripe iframe with no SSR hydration
  error and no console warning about changed `options`.
- Paying in test mode returns to `?confirming=1`, which flips to `/dashboard` once the webhook
  lands.
- Renders correctly at 320px, tablet, desktop and ultrawide with no horizontal page scroll.
- No route named `/onboarding/success` exists in `routeTree.gen.ts`.

## Note

Until [16](16-webhook-lifecycle.md) lands, the confirming screen will poll forever — that is correct
behaviour, not a bug in this slice.

## Comments

Done. `/onboarding/success` was already gone (deleted in 13's stub work) — nothing to delete here.

Route split into `RouteComponent` → `PageHeader` + `CheckoutCard`/`ConfirmingCheckout` on
`search.confirming`, with the two Stripe-facing pieces as sibling `-components`:
`EmbeddedCheckoutSection.tsx` (mount + error state) and `ConfirmingCheckout.tsx` (poll + flip).

`fetchClientSecret` stability: rather than a `useCallback` that calls `createCheckoutSession()`
directly (Stripe's own doc pattern, but gives no hook for a custom error UI), the section does its
own fetch in a `startCheckout` effect, gates rendering `EmbeddedCheckoutProvider` on
`session.status === "ready"`, and `fetchClientSecret` just resolves the already-fetched secret.
Since the provider only mounts once `ready`, and nothing flips `session` back afterward, the
callback's identity is stable post-mount — satisfies the "no changed options" warning without
needing an internal-vs-external distinction Stripe's own pattern doesn't give you.

409 detection: `DUPLICATE_SUBSCRIPTION_ERROR_MESSAGE` moved from an inline string in 14's throw into
`checkout-session-params.ts` (same cloudflare:workers-poisons-the-client-bundle reason as
`BILLING_STATUS_ROUTE`), so the client can `error.message ===` compare it without importing
`billing.ts`. No structured error/status code crosses the server-fn boundary today (14's own
comment), so string-matching the thrown message is what's available — on match,
`router.invalidate()` reruns the route's own `beforeLoad`, which is the gate; no separate redirect
logic needed.

Copy's `₹X` — the spec's copy string doesn't say where the amount comes from. Hardcoding it would
drift from whatever's actually configured against `STRIPE_PRICE_ID`, so added
`getCheckoutPriceDisplay` (`src/api/billing.ts`) reading `stripe.prices.retrieve` live and
formatting via `Intl.NumberFormat`, paired with a `checkoutPriceQuery` matching
`billingStatusQuery`'s shape. Fetched with a plain `useQuery` inside `CheckoutCard` (not a route
loader) specifically so it never runs on the `?confirming=1` branch, which doesn't render the card —
review caught an earlier version that loader-fetched it unconditionally.

Copy split into `CardTitle`/`CardDescription` rather than the spec's single em-dash sentence, to
match this repo's existing Card idiom (`OnboardingForm`, `PaymentRequiredBanner`).
