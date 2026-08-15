# 17 — `/payment-required` rewrite and the billing portal link

Parent: [PRD.md](../PRD.md) §8.5 · wireframe:
[prototypes/09-screens.md](../prototypes/09-screens.md) Label: `impl` Status: `ready-for-agent`
Depends on: [13](13-billing-status-and-gates.md)

## Goal

`/payment-required` becomes the **`past_due` screen only**, and the in-app billing link points at
Stripe's portal.

## Scope

1. **`src/routes/_authed/payment-required.tsx`** — rewritten:
   - Inverse guard: any status other than `past_due` redirects out (`active` → `/dashboard`,
     `pending` → `/onboarding/checkout`). The never-paid case **skips this interstitial entirely**
     and resumes checkout directly.
   - `max-w-sm` card in `RootLayout`. Copy: "Payment failed / We couldn't collect this month's
     payment for {org.name}. Update your payment method to restore access."
   - **Single CTA → the Stripe billing portal. Not a second checkout** — a lapsed customer needs the
     card-update portal.
   - **Keep the org switcher** from today's banner: a user in multiple orgs must be able to leave a
     `past_due` org rather than be trapped in it.
2. **Delete `src/routes/_authed/-components/PaymentRequiredBanner.tsx`** — its "Trial ended" copy
   and its `authClient.checkout({ slug })` call go with it. There is no trial and no never-paid
   banner.
3. **`src/components/CommunityLayout/AuthUser.tsx`** — replace the `/api/polar/portal` link with
   **"Manage billing"** in the same dropdown, hitting the plugin's
   `POST /subscription/billing-portal` (it needs a `returnUrl`, which is origin-checked). **Owners
   only**, matching the owner-only `authorizeReference`.
4. Analytics: `billing_portal_opened` with `{ source }` from both entry points.

## Acceptance

- A `past_due` org sees the screen; `active` and `pending` orgs are redirected out.
- The portal CTA opens a working Stripe billing portal session in test mode and returns to the app.
- A non-owner member sees **no** "Manage billing" item.
- Responsive at 320px → ultrawide.
- `grep -rn "PaymentRequiredBanner" src/` returns nothing.
