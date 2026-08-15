# 02 — Embedded Checkout inside TanStack Start on Workers (research findings)

Resolves:
[issues/02-embedded-checkout-on-tanstack-workers.md](../issues/02-embedded-checkout-on-tanstack-workers.md)
Date: 2026-08-15 Sources: Stripe official docs, `stripe/react-stripe-js` source, TanStack
Start/Router docs, Vite docs, and this repo.

---

## TL;DR / headline corrections to the ticket

Two assumptions in the ticket are **stale**:

1. `ui_mode: "embedded"` **no longer exists**. Stripe API version `2026-03-25.dahlia` removed
   `hosted` / `embedded` / `custom` and replaced them with `hosted_page` / `embedded_page` /
   `elements`. "Attempting to set a Checkout Session's `ui_mode` to `hosted`, `embedded` or `custom`
   will fail." —
   https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes
   The current create-session reference lists only `elements | embedded_page | hosted_page`. —
   https://docs.stripe.com/api/checkout/sessions/create `stripe-node` v21 and v22 both pin
   `2026-03-25.dahlia`, so a fresh `npm i stripe` gets the new enum by default. —
   https://github.com/stripe/stripe-node/wiki/Migration-guide-for-v22 **=> use
   `ui_mode: "embedded_page"`.**

2. Stripe.js `initEmbeddedCheckout()` was renamed to `createEmbeddedCheckoutPage()` in the same
   release. —
   https://docs.stripe.com/changelog/dahlia/2026-03-25/rename-init-embedded-checkout-to-create-embedded-checkout-page
   We don't call it directly (react-stripe-js does), but it pins our minimum SDK versions.

The ticket's core claim — session `metadata` does **not** reach `customer.subscription.*` — is
**confirmed correct** (see §3).

---

## 1. Packages, and how the publishable key reaches the browser

### Versions

| package                   | latest on npm (checked 2026-08-15) | why this floor                                                    |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `stripe` (server)         | `22.5.0`                           | pins API `2026-03-25.dahlia`, i.e. the `embedded_page` enum       |
| `@stripe/stripe-js`       | `9.13.0`                           | must expose `createEmbeddedCheckoutPage` on the Stripe object     |
| `@stripe/react-stripe-js` | `6.8.1`                            | its `EmbeddedCheckoutProvider` calls `createEmbeddedCheckoutPage` |

(Versions read from `npm view <pkg> version`; none of the three is currently installed in this
repo.)

`@stripe/react-stripe-js` master still exports both components — verified in
https://raw.githubusercontent.com/stripe/react-stripe-js/master/src/index.ts (exports include
`EmbeddedCheckout` and `EmbeddedCheckoutProvider`).

`EmbeddedCheckoutProvider` source
(https://raw.githubusercontent.com/stripe/react-stripe-js/master/src/components/EmbeddedCheckoutProvider.tsx):

- calls `loadedStripe.current.createEmbeddedCheckoutPage(options)` — **not** `initEmbeddedCheckout`.
  Pinning `@stripe/react-stripe-js@^6` therefore requires `@stripe/stripe-js@^9`; mixing an old
  stripe-js with new react-stripe-js is the likely failure mode here.
- accepted options: `clientSecret`, `fetchClientSecret`, `onComplete`, `onShippingDetailsChange`,
  `onLineItemsChange`.
- it **warns loudly if any option changes after mount** — so `fetchClientSecret` must be a stable
  `useCallback` with a stable dependency list, and the `options` object must not be re-created
  inline on every render.

The canonical React shape (verbatim from https://docs.stripe.com/checkout/embedded/quickstart):

```jsx
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

// Make sure to call `loadStripe` outside of a component's render to avoid
// recreating the `Stripe` object on every render.
const stripePromise = loadStripe("<<YOUR_PUBLISHABLE_KEY>>");

const fetchClientSecret = useCallback(() => {
	/* POST to your server */
}, []);
const options = { fetchClientSecret };

<EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
	<EmbeddedCheckout />
</EmbeddedCheckoutProvider>;
```

### How `VITE_PUBLIC_*` reaches the browser in _this_ repo

Do not invent a mechanism — the PostHog precedent already works and needs nothing new:

- Vite exposes any env var whose name starts with `envPrefix` (**default `VITE_`**) to client source
  via `import.meta.env`. — https://vite.dev/config/shared-options.html `VITE_PUBLIC_*` matches the
  default prefix, so no `envPrefix` override is needed, and `vite.config.ts` sets none (it only has
  `dotenv/config` imported for dev).
- Client-side read precedent: `src/routes/__root.tsx:54` —
  `apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN!}`.
- Server-side read precedent for the _same_ var: `src/lib/posthog-server.ts:8` uses
  `env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN` via `import { env } from "cloudflare:workers"`.
- Declared in `worker-configuration.d.ts` (`VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` is already at
  line 24) and, for deploy, `wrangler.jsonc` has `"keep_vars": true`.

**=> In the checkout component use `import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY`; in server
functions use `env.STRIPE_SECRET_KEY` from `cloudflare:workers`, matching `src/lib/polar.ts`.**

Caveat: `import.meta.env.*` is inlined at build time, so the publishable key is baked into the
client bundle — correct for a publishable key, and identical to how the PostHog token is handled
today.

### Server client (Workers)

Model `src/lib/stripe.ts` on `src/lib/polar.ts`:

```ts
import Stripe from "stripe";
import { env } from "cloudflare:workers";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
	maxNetworkRetries: 3,
	timeout: 30 * 1000,
});
```

Stripe's own Workers template does exactly this — no `httpClient: Stripe.createFetchHttpClient()`
override, just `new Stripe(key, { maxNetworkRetries: 3, timeout: 30 * 1000 })`. —
https://github.com/stripe-samples/stripe-node-cloudflare-worker-template (`src/index.js`) This repo
also has `nodejs_compat` in `wrangler.jsonc` compat flags, which removes the historical reason for
the fetch-http-client override. For webhook signature verification on Workers use the async variant
(`constructEventAsync` + `Stripe.createSubtleCryptoProvider()`); that belongs to ticket 07 and I did
not verify it end-to-end here — **could not verify** from a first-party doc page in this pass, only
from issue threads on `stripe/stripe-node`.

---

## 2. SSR: keeping TanStack Start from breaking

`loadStripe` fetches `js.stripe.com` and the embedded checkout is an iframe — both browser-only.
Three candidate patterns, and the verdict:

**(a) `ClientOnly` — recommended, idiomatic here.** `@tanstack/react-router@1.170.15` (this repo's
installed version) exports `ClientOnly` and `useHydrated` from its root entry
(`node_modules/@tanstack/react-router/dist/esm/index.d.ts:8`). Local source
(`dist/esm/ClientOnly.js`) shows it is a `useSyncExternalStore`-based hydration gate:

```js
function ClientOnly({ children, fallback = null }) {
	return useHydrated() ? <>{children}</> : <>{fallback}</>;
}
function useHydrated() {
	return React.useSyncExternalStore(
		subscribe,
		() => true,
		() => false
	);
}
```

So it renders `fallback` on the server and on the first client render, then swaps — no hydration
mismatch. TanStack's SSR guide names it for this purpose: "The ClientOnly component only renders
children after hydration." — https://tanstack.com/start/v0/docs/framework/react/guide/selective-ssr

This is the right pick because the checkout page still wants SSR'd `beforeLoad` (the `_authed` /
org-status gates) and an SSR'd shell/skeleton; only the Stripe iframe subtree must be client-side.

**(b) `ssr: false` route option — works, but too blunt.** Per the same doc, `ssr: false` means
"Disable server-side execution of the route's `beforeLoad` and `loader`. [Disable] rendering of the
route component." That would kill the auth/org gate on the server for this route, and the setting is
inherited by children and can only be made _more_ restrictive down the tree. If you want a middle
ground, `ssr: 'data-only'` keeps `beforeLoad` and `loader` server-side while skipping server
rendering of the component — a legitimate fallback if `ClientOnly` proves awkward.

**(c) `useEffect`-gated `useState` flag** — the hand-rolled version of (a). No reason to write it
when `ClientOnly` ships in the router already.

Also keep `loadStripe(...)` at **module scope**, outside the component (Stripe's explicit
instruction: "Make sure to call `loadStripe` outside of a component's render to avoid recreating the
`Stripe` object on every render" — https://docs.stripe.com/checkout/embedded/quickstart). Because
the module is imported by an SSR'd route file, that top-level call runs on the Worker too;
`@stripe/stripe-js`'s `loadStripe` is documented to be safe to call during server render — the
provider "can also pass in `null` or a `Promise` resolving to `null` if you are performing an
initial server-side render" (react-stripe-js provider docs). If the top-level call turns out to be
problematic on the Worker, put the whole checkout component in its own module that is only reached
under `ClientOnly` (dynamic `import()` / `React.lazy`), which keeps the module-scope rule intact.

Note `EmbeddedCheckoutProvider` uses plain `useEffect` (not `useLayoutEffect`) and does **not** do
`typeof window` guards internally — the guard is our responsibility.

Shape:

```tsx
// src/routes/_authed/onboarding/checkout/-components/StripeCheckout.tsx
const stripePromise = loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export function StripeCheckout() {
	const fetchClientSecret = useCallback(
		async () => (await createOrgCheckoutSession()).clientSecret,
		[]
	);
	return (
		<ClientOnly fallback={<Skeleton className="h-[600px] w-full" />}>
			<EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
				<EmbeddedCheckout />
			</EmbeddedCheckoutProvider>
		</ClientOnly>
	);
}
```

---

## 3. `checkout.sessions.create` params, and where the org id must go

All parameter semantics below quoted from https://docs.stripe.com/api/checkout/sessions/create.

```ts
const session = await stripe.checkout.sessions.create(
	{
		mode: "subscription", // "Use Stripe Billing to set up fixed-price subscriptions."
		ui_mode: "embedded_page", // NOT "embedded" — see headline note
		line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
		customer: orgCustomerId, // see §4
		return_url: `${origin}/onboarding/success?session_id={CHECKOUT_SESSION_ID}`,

		client_reference_id: orgId, // lands on checkout.session.* only
		metadata: { organizationId: orgId }, // lands on checkout.session.* only
		subscription_data: {
			metadata: { organizationId: orgId }, // lands on the Subscription => customer.subscription.*
		},
	},
	{ idempotencyKey } // see §6
);
// return session.client_secret to the browser
```

Notes on individual params:

- `mode` is **required**; "Pass `subscription` if the Checkout Session includes at least one
  recurring item." `line_items` "is required for `payment` and `subscription` mode".
- `return_url` is "required conditionally … if `ui_mode` is `embedded_page` or `elements` and
  redirect-based payment methods are enabled on the session."
- `success_url` and `cancel_url` are **not allowed** when `ui_mode` is `embedded_page` — passing
  them will error. This is a change from the current Polar flow which uses
  `successUrl: "/onboarding/success?checkout_id={CHECKOUT_ID}"` (`src/lib/auth.ts:267`).
- `customer_creation` "Can only be set in `payment` and `setup` mode" — **do not pass it** in
  subscription mode. Subscription mode always produces a Customer.
- No trial: simply omit `subscription_data.trial_period_days`. Leave `payment_method_collection` at
  its default `always`.
- `client_reference_id` is "A unique string to reference the Checkout Session … can be used to
  reconcile the session with your internal systems. The maximum length is 200 characters." Our
  better-auth org ids fit comfortably.
- `expires_at`: "It can be anywhere from 30 minutes to 24 hours after Checkout Session creation. By
  default, this value is 24 hours from creation." Relevant to §6.

### CRITICAL — which field lands on `customer.subscription.*`

The ticket's suspicion is confirmed verbatim by https://docs.stripe.com/metadata/use-cases (§"Set
metadata indirectly"):

> "After your customer completes the checkout process, the metadata previously provided in
> `subscription_data.metadata` is set on the newly created **Subscription** object. This determines
> which events include the metadata. For example, events that contain a Checkout Session, such as
> `checkout.session.completed`, contain values provided through the top-level `metadata` parameter."

> "Events that contain a `Subscription` object, such as `customer.subscription.created`, contain
> values provided through `subscription_data.metadata`. However, because that event contains a
> Subscription object, Stripe provides the values in the top-level `metadata` field on the
> Subscription object."

Concretely:

| where you put `organizationId` | visible on `checkout.session.completed` | visible on `customer.subscription.created/updated/deleted` | visible on `invoice.*`                           |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| session `metadata`             | ✅ (`data.object.metadata`)             | ❌                                                         | ❌                                               |
| `client_reference_id`          | ✅ (`data.object.client_reference_id`)  | ❌                                                         | ❌                                               |
| `subscription_data.metadata`   | ❌                                      | ✅ (`data.object.metadata`)                                | ✅ (`data.object.subscription_details.metadata`) |

The invoice row is also from the same doc: "the subscription's metadata is transferred to
`subscription_details.metadata` on the `Invoice` objects created by the subscription."

**=> Set all three.** `subscription_data.metadata.organizationId` is the load-bearing one for the
lifecycle webhooks in ticket 07 (`customer.subscription.updated/deleted`, dunning via `invoice.*`);
session `metadata` + `client_reference_id` are cheap and make `checkout.session.completed` and
Dashboard search self-describing. Do **not** rely on session metadata alone.

**Belt-and-braces:** also persist `organizationId` on the Stripe **Customer**'s metadata (§4), so
even a webhook payload with neither of the above still resolves via `event.data.object.customer`.

---

## 4. Customer: pre-create per org, or let Checkout create one?

**Recommendation: pre-create, replacing the Polar block in `afterCreateOrganization`
(`src/lib/auth.ts:88-104`) rather than removing the hook.**

Today that hook does `polarClient.customers.create({ email, externalId: orgId, name })` and merges
`{ customerId }` into org metadata (`src/lib/org-status.ts` already types `customerId` and
`subscriptionId` on `OrgMetadata`). The Stripe equivalent:

```ts
afterCreateOrganization: async (payload) => {
	const orgId = payload.organization.id;
	const result = await safeAsync(
		stripe.customers.create(
			{
				email: payload.user.email,
				name: payload.organization.name,
				metadata: { organizationId: orgId },
			},
			{ idempotencyKey: `org-customer:${orgId}` }
		)
	);
	if (!result.success) { console.error(...); return; }   // best-effort, never blocks org creation
	await mergeOrgMetadata(orgId, { customerId: result.data.id });
},
```

Tradeoffs:

|                               | pre-create + pass `customer`                                                                                                                                         | let Checkout create it                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| org → customer mapping        | exists before any payment; `customer.metadata.organizationId` gives a third independent resolution path in webhooks                                                  | only exists after `checkout.session.completed`; a race where `customer.subscription.created` arrives first must be tolerated |
| duplicate customers           | none — one customer per org, reused across retries                                                                                                                   | every abandoned-then-retried checkout can mint a new Customer, littering the Dashboard                                       |
| billing portal (ticket 05/09) | can open the portal for an org that never paid                                                                                                                       | needs a customer to exist first                                                                                              |
| `customer_creation` param     | N/A in subscription mode either way                                                                                                                                  | N/A                                                                                                                          |
| failure mode                  | hook failure leaves org with no `customerId`; must fall back to lazy create-or-get at checkout time                                                                  | none extra                                                                                                                   |
| prefill                       | Stripe docs: "If the Customer already has a valid `email` set, the email will be prefilled and not editable in Checkout." Good UX for a compulsory org subscription. | customer types email manually                                                                                                |

Stripe explicitly supports the pre-create path: "To associate a Checkout Session with a customer
that already exists, provide the `customer` when creating a session." —
https://docs.stripe.com/checkout/embedded/quickstart

**Mitigate the hook-failure case** with a lazy `ensureOrgStripeCustomer(orgId)` helper called by the
create-session server function: read `metadata.customerId`, else create + merge. Since the hook is
best-effort by design, the checkout path must not assume it succeeded. Stripe has no `externalId`
uniqueness equivalent to Polar's, so guard with the idempotency key above **and** the
`metadata.organizationId` on the Customer (searchable via
`customers/search?query=metadata['organizationId']:'…'` — https://docs.stripe.com/metadata/use-cases
§"The Search API").

---

## 5. Return page

`return_url` gets the literal template `{CHECKOUT_SESSION_ID}` substituted by Stripe:

> "Include the `{CHECKOUT_SESSION_ID}` template variable in the URL. When Checkout redirects a
> customer, it replaces the variable with the actual Checkout Session ID. When rendering your return
> page, retrieve the Checkout Session status using the Checkout Session ID in the URL." —
> https://docs.stripe.com/payments/checkout/custom-success-page?payment-ui=embedded-page

Statuses to handle (same page):

- `complete` — "The payment succeeded. Use the information from the Checkout Session to render a
  success page."
- `open` — "The payment failed or was cancelled. Remount Checkout so that your customer can try
  again."

Stripe is emphatic that the return page is **not** the fulfilment trigger:

> "You can't rely on triggering fulfilment only from your checkout landing page, because your
> customers aren't guaranteed to visit that page. … Set up a webhook event handler so Stripe can
> send payment events directly to your server, bypassing the client entirely."

### Recommendation: do both, and keep today's polling shape

`/onboarding/success` today (`src/routes/_authed/onboarding/success/index.tsx`) validates
`{ checkout_id: z.string() }`, prefetches `getOrgStatusQuery()` in `beforeLoad`, polls/refetches,
and navigates to `/dashboard` once `orgStatus.status === ORGANIZATION_STATUS.active`. That pattern
is correct and should survive the migration — only the search-param name and the confirmation source
change:

1. `validateSearch: z.object({ session_id: z.string() })` (was `checkout_id`).
2. New server function `getCheckoutSessionStatus({ sessionId })` →
   `stripe.checkout.sessions.retrieve` returning `{ status, payment_status, subscriptionId }`.
   **Authorize it**: assert the session's `client_reference_id` / `metadata.organizationId` equals
   `context.session.session.activeOrganizationId` before returning anything, otherwise it is an
   unauthenticated session-id oracle.
3. If `status === "open"` → send the user back to the checkout route to remount.
4. If `status === "complete"` → optionally write the org to `active` right there (idempotently — the
   same write the webhook performs), then keep polling `getOrgStatusQuery()` as today until the org
   flips, so a slow webhook doesn't strand the user on a spinner. The existing "Recheck" button is a
   good manual escape hatch; add a bounded auto-poll (`refetchInterval` ~2s, cap ~30s) instead of
   relying on the user pressing it.

The truth of record stays the webhook (`checkout.session.completed` + `customer.subscription.*`) —
step 4's optimistic write is a latency optimisation, not the source of truth.

### Optional: skip the redirect entirely

`redirect_on_completion` (values `always` (default) / `if_required` / `never`) plus an `onComplete`
callback lets embedded checkout render in-app success without a round trip; `never` "removes the
`return_url` requirement" but "disables redirect-based payment methods". `onComplete` "is called
when the Checkout Session completes successfully, or when the `checkout.session.completed` webhook
event is sent." Since we are card-first and compulsory, `redirect_on_completion: "if_required"` +
`onComplete` is a viable nicer flow that avoids a full page navigation — but it costs us the
`session_id` in the URL, so the polling-on-org-status path becomes mandatory rather than a backstop.
**Default recommendation: keep `always` + `return_url`** (matches the existing `/onboarding/success`
route and survives a mid-payment tab reload).

---

## 6. Idempotency / preventing a duplicate subscription

Three distinct hazards, three distinct defences.

**(a) Double-click / retried POST on the create-session call — use an idempotency key.**

> "All `POST` requests accept idempotency keys." … "Stripe's idempotency works by saving the
> resulting status code and body of the first request made for any given idempotency key …
> Subsequent requests with the same key return the same result, including `500` errors." … "You can
> remove keys from the system automatically after they're at least 24 hours old." … "The idempotency
> layer compares incoming parameters to those of the original request and errors if they're not the
> same." — https://docs.stripe.com/api/idempotent_requests

Node SDK: pass `{ idempotencyKey }` as the second (request-options) argument.

Choose a key that is stable for the _intent_, not per-request. A per-render UUID defeats the
purpose. Recommended: `stripe-checkout:${orgId}:${YYYY-MM-DD}` or, better, a value we persist:

```ts
// derive once, store on org metadata alongside the session id
{
	idempotencyKey: `checkout:${orgId}:${checkoutAttemptId}`;
}
```

Caveat: Stripe prunes keys after ~24h, and `expires_at` on a session defaults to 24h — so the key
alone is not a permanent duplicate guard.

**(b) Page reload re-mounting checkout — reuse the open session, don't mint a new one.**

`EmbeddedCheckoutProvider` calls `fetchClientSecret` on mount, so a plain reload creates a _second_
Checkout Session. Multiple open sessions are harmless on their own (only a completed one creates a
subscription), but they are noisy and interact badly with (a). Make the server function
create-or-reuse:

1. Read `metadata.checkoutSessionId` off the org.
2. If present, `stripe.checkout.sessions.retrieve(id)`; if `status === "open"` and it is not past
   `expires_at`, return its existing `client_secret` — do not create a new session.
3. Otherwise create a fresh one and merge the new id into org metadata.

**(c) The real guard: never create a second subscription for an org that already has one.**

Before creating any session, short-circuit on our own state — the org-status machinery in
`src/lib/org-status.ts` already carries `status`, `subscriptionId`, and `trialEndsAt`:

```ts
const resolved = await resolveOrgStatus(orgId);
if (resolved.status === ORGANIZATION_STATUS.active && metadata.subscriptionId) {
	// already subscribed — redirect to /dashboard or the billing portal, never to checkout
}
```

Additionally, verify server-side against Stripe with
`stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 })` before creating
the session — that closes the window where our D1 row is stale because the webhook hasn't landed.
**I could not find a Stripe-side setting that refuses a second subscription for the same
customer+price** — Stripe permits it by design, so this check must live in our code. (Searched the
Checkout Sessions create reference; no such parameter exists there.)

Finally, make the webhook handler itself idempotent — `customer.subscription.created` can be
delivered more than once, and the org-metadata write must be a merge keyed on `subscriptionId`, not
a blind append. (Detail belongs to ticket 07.)

---

## Migration deltas vs. the current Polar flow

| today (Polar)                                                                                                                   | Stripe equivalent                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@polar-sh/better-auth` `checkout({ successUrl: "/onboarding/success?checkout_id={CHECKOUT_ID}" })` (`src/lib/auth.ts:256-267`) | own `createServerFn` calling `stripe.checkout.sessions.create` with `return_url` + `{CHECKOUT_SESSION_ID}`; `success_url` is illegal in `embedded_page` |
| hosted Polar checkout page (redirect out)                                                                                       | `EmbeddedCheckoutProvider` mounted in-app under `ClientOnly`                                                                                            |
| `afterCreateOrganization` → `polarClient.customers.create({ externalId: orgId })` (`src/lib/auth.ts:88`)                        | `stripe.customers.create({ metadata: { organizationId } })` + idempotency key; `externalId` has no direct Stripe analogue                               |
| `search: { checkout_id }` on `/onboarding/success`                                                                              | `search: { session_id }`                                                                                                                                |
| org metadata `{ customerId, subscriptionId, status, trialEndsAt }` (`src/lib/org-status.ts`)                                    | unchanged shape; add `checkoutSessionId` for reuse (§6b). No trial => `trialEndsAt: null` from the start                                                |

---

## Unresolved / could not verify

- Whether `stripe-node` v22 needs any Workers-specific `httpClient` override **with `nodejs_compat`
  on** — Stripe's own Workers template passes none, but the template predates v22 and I found no
  first-party doc page stating the requirement either way.
- Webhook verification specifics on Workers (`constructEventAsync` + `createSubtleCryptoProvider`,
  and the "Body has already been used" `request.text()` pitfall) — only found via GitHub issue
  threads, not a first-party doc. Defer to ticket 07 and verify there.
- Whether Stripe branding settings / appearance for embedded checkout can be themed to match this
  app's light/dark themes beyond the Dashboard branding settings — not investigated.
