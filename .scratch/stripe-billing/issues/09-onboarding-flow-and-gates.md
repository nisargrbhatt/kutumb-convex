# 09 — Onboarding flow, route gates and page UI

Parent: [MAP.md](../MAP.md) Label: `wayfinder:prototype` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: ~~[05](05-checkout-architecture.md)~~ (closed),
~~[06](06-subscription-state-model.md)~~ (closed), ~~[08](08-auth-surface-decisions.md)~~ (closed) —
**unblocked, on the frontier**

## Question

Nail the end-to-end flow by prototyping the screens (`/prototype`), then record the route contract.

Target flow from the brief: fresh login → `/onboarding/create` (org details) → Stripe checkout page
→ payment → their organization.

- Route layout: does checkout live at `/onboarding/checkout`? Does `/onboarding/success` survive now
  that there is no `checkout_id` search param, or does the return land straight on the checkout
  route in a confirming state?
- Gate rewrites: `_authed.tsx` (no `activeOrganizationId` → `/onboarding/create`),
  `_authed/_community.tsx` (pending → `/payment-required`), and `_authed/payment-required.tsx`. With
  no trial, an org is unpaid from creation until the webhook lands — make sure a freshly created org
  does not bounce between the checkout page and the payment-required banner.
- `PaymentRequiredBanner` today says "Trial ended" and calls `authClient.checkout({ slug })`.
  Prototype its replacement: copy for never-paid vs lapsed (per
  [06](06-subscription-state-model.md)), and the resume-checkout CTA.
- Post-payment wait: the webhook may land after the redirect. Prototype the confirming state — reuse
  today's polling `getOrgStatusQuery` pattern or retrieve the session server-side.
  [06](06-subscription-state-model.md) kept the 5s poll but **scoped it to exactly this screen** (no
  KV cache anywhere on the gate) and handed the server-side-retrieve alternative to this ticket.
- Three banner states, not two: [06](06-subscription-state-model.md) split blocked into `pending`
  (never paid → resume checkout) and `past_due` (was paying, now failing → **billing portal**, not a
  second checkout). Both block the app immediately. Copy for each is this ticket's.
- The embedded Stripe iframe in the existing `RootLayout` / card shell, responsive across mobile →
  ultrawide, per the repo's page-design rules. Breadcrumbs on the onboarding routes.
- Login and signup page composition. [08](08-auth-surface-decisions.md) fixed the **route table**
  (separate `/login`, `/signup`, `/forgot-password`, `/reset-password`; no `/verify-email` page) —
  what is left here is the card layout and the error/empty states it must render: the 422 collision
  copy, the `"account not linked"` cliff copy, and the "signups are closed" state.

### Added by [08](08-auth-surface-decisions.md)

- **Unverified-email nag.** Verification no longer blocks, so unverified users reach the full app.
  Prototype the dismissible nag + resend action, and decide where it sits relative to the three
  billing banner states — an unverified user in `past_due` must not see two stacked banners.
- **Invite entry.** Invite email → `/login?redirectTo=…`, and `redirectTo` must survive the hop to
  `/signup`. Decide whether to prefill the invited email ([08](08-auth-surface-decisions.md) left
  this open) and confirm invite acceptance still works while `BETTER_AUTH_DISABLE_SIGNUP` is on.
- Where the billing-portal link lives now that `AuthUser.tsx` points at `/api/polar/portal`.

## Answer

Prototype: [prototypes/09-screens.md](../prototypes/09-screens.md) — wireframes, route table, gate
logic and copy strings, consumed verbatim by the impl tickets.

**Route table.** `/onboarding/checkout` is **one self-confirming route**: it mounts the embedded
iframe, and Stripe's `return_url` points back at itself as `?confirming=1`, which swaps the iframe
for the spinner. **`/onboarding/success` is deleted** — embedded checkout produces no `checkout_id`,
so its search param had nothing to key on and its waiting-room job moved onto the checkout route.

**Gates branch on status, not on a boolean.** `_community` resolves `resolveBillingStatus(orgId)`
(06) and routes `active` → app, `pending` → `/onboarding/checkout`, `past_due` →
`/payment-required`. So **`/payment-required` survives as the `past_due` screen only**, with a
single billing-portal CTA and the org switcher; the never-paid case skips the interstitial and
resumes checkout directly. `PaymentRequiredBanner` and its "Trial ended" copy are **deleted** — 06's
three states become two full-page routes plus the app, not three banner variants.

**No bounce loop.** A freshly created org is `pending` until the webhook lands, and `pending`
resolves to a route _outside_ `_community`, so nothing re-enters the gate. Both billing routes carry
inverse guards.

**Confirming polls, and only polls.** `useQuery(billingStatusQuery, { refetchInterval: 5000 })` —
the same DB read the gate uses. The server-side `checkout.sessions.retrieve` alternative 06 handed
over is **rejected**: it would either lie (screen says paid while the gate says pending) or make the
page a second writer to the subscription row, contradicting 07's stateless webhook-is-sole-writer
design. `[Recheck]` is the manual escape hatch; **no timeout cap** — it polls until it flips.

**The nag's stacking problem dissolved rather than being solved.** 08 asked how an unverified user
in `past_due` avoids two stacked banners; because billing states are now full-page redirects, the
nag sits in `CommunityLayout` and is structurally incapable of rendering beside one. Dismissible per
session, inline `[Resend]` with a 60s cooldown.

**Invite entry.** `redirectTo` _and_ `invitation` are declared search params on both `/login` and
`/signup` and survive the hop. Invited email is **prefilled read-only** from the invitation row, so
a signup can never mismatch the invited address and orphan the invite.
**`BETTER_AUTH_DISABLE_SIGNUP` is absolute — no invite exemption.** While it's on, an invitee with
no account cannot proceed; existing users still accept normally. Accepted as the cost of a
zero-bypass-surface emergency stop, and to be documented as such.

**Billing portal link** moves from `AuthUser.tsx`'s `/api/polar/portal` to "Manage billing" in the
same dropdown, **owners only** (matching 05's owner-only `authorizeReference`).

Auth-page error states fixed in the prototype: the 422 collision copy, the `"account not linked"`
cliff copy, the signups-closed state, and a deliberately generic reset-request response.
