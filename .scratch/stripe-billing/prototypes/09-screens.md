# Prototype — onboarding, gates and billing screens

Asset for [09](../issues/09-onboarding-flow-and-gates.md). Wireframes + copy, not code. Impl tickets
consume the route table, the gate logic and the copy strings verbatim.

## Route table

| Route                     | Layout            | Purpose                                        |
| ------------------------- | ----------------- | ---------------------------------------------- |
| `/login`                  | `RootLayout`      | password + Google                              |
| `/signup`                 | `RootLayout`      | password + Google; invite-aware                |
| `/forgot-password`        | `RootLayout`      | request reset                                  |
| `/reset-password`         | `RootLayout`      | consume token                                  |
| `/onboarding/create`      | `RootLayout`      | org details → creates org + Stripe customer    |
| `/onboarding/checkout`    | `RootLayout`      | embedded checkout **and** the confirming state |
| `/onboarding/invitations` | `RootLayout`      | accept/reject pending invites (unchanged)      |
| `/payment-required`       | `RootLayout`      | `past_due` only — billing portal CTA           |
| `/dashboard` &c.          | `CommunityLayout` | the app, behind the `_community` gate          |

**Deleted:** `/onboarding/success` (no `checkout_id` exists under embedded checkout; its
waiting-room job moved into `/onboarding/checkout`).

## Gate logic

`_authed.tsx` — unchanged in shape:

```
no session                        → /login?redirectTo=<pathname>
no activeOrganizationId
  and not under /onboarding       → /onboarding/create
```

`_authed/_community.tsx` — rewritten, branches on `resolveBillingStatus(orgId)` (06):

```
active    → render CommunityLayout
pending   → redirect /onboarding/checkout
past_due  → redirect /payment-required
```

`_authed/payment-required.tsx` — inverse guard: any status other than `past_due` redirects out
(`active` → `/dashboard`, `pending` → `/onboarding/checkout`).

`_authed/onboarding/checkout` — inverse guard too: `active` → `/dashboard`, `past_due` →
`/payment-required`. Exception: while `?confirming=1` is present, `active` is the success path
(toast, then `/dashboard`) rather than a bare redirect.

**No bounce loop:** a freshly created org is `pending` from creation until the webhook lands, and
`pending` resolves to `/onboarding/checkout`, which sits _outside_ `_community`. Nothing on that
route re-enters the gate.

## Screens

### `/onboarding/checkout` — pay

```
┌─────────────────────────────────────────┐
│  ⌂ Kutumb                                │
│  Home › Onboarding › Payment             │  ← breadcrumbs
├─────────────────────────────────────────┤
│  Start your Kutumb subscription          │
│  ₹X / month for {org.name}. Cancel any   │
│  time from billing settings.             │
│                                          │
│  ┌───────────────────────────────────┐   │
│  │  <EmbeddedCheckout />             │   │
│  │  (Stripe iframe, auto-height)     │   │
│  └───────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

- Mounted inside TanStack `ClientOnly` (02) — never `ssr: false`.
- Card shell `max-w-2xl` — wider than the `max-w-sm` auth cards; the iframe needs the room.
  Full-bleed under `sm`, centred with generous gutters at `2xl`+. Iframe is `w-full`, height driven
  by Stripe.
- `ui_mode: "embedded_page"` (02). `return_url` = `/onboarding/checkout?confirming=1`.
- Client secret fetched from our own `createCheckoutSession` server fn (05).
- Error state (session creation failed, or 409 duplicate from 05's guard): replace the iframe with
  "We couldn't start checkout." + `[Try again]`; on 409 specifically, refetch billing status instead
  — the org is already paid and the gate will move them.

### `/onboarding/checkout?confirming=1` — confirming

```
┌─────────────────────────────────────────┐
│  Home › Onboarding › Payment             │
├─────────────────────────────────────────┤
│  Payment received                        │
│  Setting up {org.name}.                  │
│  ┌───────────────────────────────────┐   │
│  │ ◐  Confirming with our server     │   │
│  │    This usually takes a few        │   │
│  │    seconds.                        │   │
│  └───────────────────────────────────┘   │
│  [ ⟳ Recheck ]                           │
└─────────────────────────────────────────┘
```

- `useQuery(billingStatusQuery, { refetchInterval: 5000 })` — the same DB read the gate uses. The
  webhook is the only writer (07); Stripe is not retrieved here.
- On `active`: capture `payment_completed`, success toast, `navigate({ to: "/dashboard" })`.
- `[Recheck]` = manual `refetch()`. **No timeout cap** — it polls until it flips.

### `/payment-required` — past_due

```
┌─────────────────────────────────────────┐
│  Payment failed                          │
│  We couldn't collect this month's        │
│  payment for {org.name}. Update your     │
│  payment method to restore access.       │
│                                          │
│  [ Manage billing ↗ ]   [ Org ▾ ]        │
└─────────────────────────────────────────┘
```

- Single CTA → Stripe billing portal (plugin's portal endpoint, 01). **Not** a second checkout.
- Org switcher retained from today's banner: a user in multiple orgs must be able to leave a
  `past_due` org rather than being trapped.
- `max-w-sm` card, `RootLayout`.

### `PaymentRequiredBanner` — deleted

Replaced by the two routes above. Its "Trial ended" copy and `authClient.checkout({ slug })` call go
with it; there is no trial and no never-paid banner (never-paid resumes checkout directly).

### Verify-email nag — in `CommunityLayout`

```
┌──────────────────────────────────────────────┐
│ ✉  Verify your email to secure your account. │
│    [Resend]                             [×]  │
└──────────────────────────────────────────────┘
[ sidebar ][ breadcrumbs / page content        ]
```

- Renders only when `session.user.emailVerified === false`. Lives at the top of the app shell, so it
  is structurally incapable of appearing on a billing screen — those are separate routes outside
  `CommunityLayout`. No stacking rule needed.
- `[Resend]` calls better-auth's send-verification-email; disabled with a 60s cooldown after a send,
  toast confirms. Dismiss (`[×]`) is per-session (`sessionStorage`), returns next login.

### Auth pages — layout and states

All four are `max-w-sm` cards in `RootLayout`, matching today's `/login`.

`/login`: email, password, `[Sign in]`, "Forgot password?" link, divider, `[Continue with Google]`,
footer "New here? Create an account" → `/signup` **carrying `redirectTo`**.

`/signup`: name, email, password (min 8, no composition rules — 08), `[Create account]`, divider,
Google, footer → `/login` carrying `redirectTo`.

Error/empty states this ticket owns:

| Trigger                                                                             | Copy                                                                                                                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 422 email collision on signup                                                       | "An account with this email already exists. Sign in instead, or continue with Google." + link                                                                  |
| `"account not linked"` on Google, unverified password account (08's accepted cliff) | "This email is already registered with a password. Sign in with your password, then verify your email to link Google."                                         |
| `BETTER_AUTH_DISABLE_SIGNUP` on                                                     | Form replaced entirely: "Signups are closed. Kutumb isn't accepting new accounts right now." + link to `/login`                                                |
| Reset requested for a Google-only account                                           | Generic success copy regardless (08 accepted enumeration on signup, but reset stays generic): "If that email has a password account, we've sent a reset link." |

### Invite entry

- Invite email links to `/login?redirectTo=/onboarding/invitations&invitation=<id>`.
- `redirectTo` **and** `invitation` survive the `/login` ↔ `/signup` hop — both are declared search
  params on both routes and forwarded by the footer links.
- On `/signup?invitation=<id>`: loader reads the invitation row server-side and renders the email
  **prefilled and read-only**, so the created account can never mismatch the invited address.
- **`BETTER_AUTH_DISABLE_SIGNUP` is absolute** — no invite exemption. While it's on, an invitee with
  no account sees "Signups are closed" and cannot proceed. Existing users accept invites normally.
  This is an accepted, documented consequence of the emergency stop.
- Invitees never touch checkout (map decision): accepting → `/dashboard`.

### Billing portal link in-app

`AuthUser.tsx`'s `/api/polar/portal` link is replaced by **"Manage billing"** in the same user
dropdown, hitting the better-auth Stripe plugin's portal endpoint. Visible to **owners only**
(matches 05's `authorizeReference` = owner-only). `/payment-required` links to the same endpoint.

## Responsive rules

Per the repo's page-design rules, every screen above:

- Auth + `/payment-required`: `max-w-sm`, `p-6 md:p-10`, centred — today's pattern, unchanged.
- `/onboarding/checkout`: `max-w-2xl`; the Stripe iframe is `w-full` and never forces horizontal
  page scroll at 320px.
- Breadcrumbs on `/onboarding/create` and `/onboarding/checkout`; auth pages are pre-session and
  carry the wordmark instead.
- The verify nag wraps to two lines on mobile rather than truncating.
