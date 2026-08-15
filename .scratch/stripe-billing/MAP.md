# Map — Polar → Stripe billing + email/password auth

Label: `wayfinder:map` Status: `needs-triage` Source brief:
[payment_change_plan.md](../../payment_change_plan.md)

## Destination

A spec at `.scratch/stripe-billing/PRD.md` plus numbered implementation issues under
`.scratch/stripe-billing/issues/`, sufficient for an agent to rip out Polar and land: flat recurring
monthly Stripe subscription, compulsory checkout (no trial), embedded Stripe checkout page, webhook
driven subscription lifecycle, and email/password auth alongside Google.

Planning only. Wayfinder sessions decide; a separate agent executes the impl tickets.

## Notes

- Domain: billing + auth + onboarding on TanStack Start / Cloudflare Workers / D1 + Drizzle /
  better-auth (organization plugin).
- Skills every session should consult: `/better-auth-best-practices`,
  `/better-auth-security-best-practices`, `/organization-best-practices`,
  `/tanstack-start-best-practices`, `/tanstack-query-best-practices`, `/cloudflare`,
  `/workers-best-practices`. Use `/grilling` + `/domain-modeling` for grilling tickets.
- App is pre-launch. **DB may be cleared**; breaking existing user flows and existing rows is fine.
  No data migration tickets.
- `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and
  `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` are all declared in `worker-configuration.d.ts`. No new env
  vars are needed. `STRIPE_PRODUCT_ID` stays declared even though embedded checkout only consumes
  the price id — leave it alone.
- Polar surface to remove: `src/lib/polar.ts`, the `polar()` plugin block in `src/lib/auth.ts`,
  `polarClient()` in `src/lib/auth-client.ts`, `src/routes/api/polar/portal.ts`, the portal link in
  `src/components/CommunityLayout/AuthUser.tsx`, `@polar-sh/*` deps.

## Decisions so far

- Destination is a spec + impl tickets, not the implementation itself.
- Stripe wires in through the official **`@better-auth/stripe` plugin** (not hand-rolled), subject
  to the capability audit in
  [01 — Better-auth Stripe plugin capability audit](issues/01-better-auth-stripe-plugin-audit.md).
- Checkout page uses **Stripe Embedded Checkout** (`@stripe/react-stripe-js`), mounted in-app.
- Subscription state lives in a **dedicated table**, not the org `metadata` JSON blob.
- An abandoned checkout **leaves the org in place as `pending`**; the user resumes from the
  payment-required banner on next login.
- Webhook handling **derives org status from `subscription.status`** on every event rather than
  branching per event name; the `customer.subscription.deleted` event deletes the org.
- Invitees never touch checkout — the subscription is org-level; accepting an invite goes straight
  to the dashboard.
- In scope, all four: rip out the trial entirely, rip out seat metering, Stripe billing portal,
  email verification + password reset.
- Deleting the org on `customer.subscription.deleted` is **unconditional and irreversible** — no
  grace window, no soft delete. Confirmed intentional;
  [07](issues/07-webhook-lifecycle-and-org-deletion.md) designs the mechanics, not the policy.
- [04 — What actually happens when an organization row is deleted](issues/04-org-delete-cascade-audit.md)
  — every table keyed on `organization.id` cascades (Drizzle **and** emitted SQL), D1 enforces FKs
  by default so cascades genuinely fire, and no table needs an explicit delete step. The one gap is
  `session.active_organization_id` — no FK, goes dangling, and `resolveOrgStatus` throws rather than
  redirecting.
- [01 — Better-auth Stripe plugin capability audit](issues/01-better-auth-stripe-plugin-audit.md) —
  **adopt the plugin partially.** Keep its schema, webhook endpoint,
  `referenceId`/`authorizeReference` tenancy and billing portal. It **cannot** produce a
  `client_secret` (it forces `success_url`/`cancel_url`), so **we own checkout-session creation**.
  It handles only 4 events and no `invoice.*`; `onEvent` covers the rest. Versions move in lockstep
  with `better-auth`.
- [02 — Embedded Checkout inside TanStack Start on Workers](issues/02-embedded-checkout-on-tanstack-workers.md)
  — **`ui_mode` is `"embedded_page"`, not `"embedded"`** (renamed in API `2026-03-25.dahlia`; the
  old value fails). Only `subscription_data.metadata` reaches `customer.subscription.*`. Pre-create
  one Stripe customer per org. Mount via TanStack's `ClientOnly`, never `ssr: false`. Nothing in
  Stripe prevents a duplicate subscription — that guard is ours.
- [03 — Email/password, verification and reset in better-auth](issues/03-email-password-auth-research.md)
  — **cheap: no custom password hashing** (verified `node:crypto` scrypt in our own build output),
  no new API routes, no DB migration, one new page (`/reset-password`). Credential signup on an
  existing email does **not** auto-link. The real cost is rate limiting: the repo configures none,
  which Google-only login masked.
- [05 — Where the checkout session is created](issues/05-checkout-architecture.md) — **we own
  `createCheckoutSession` entirely**, reproducing the plugin's undocumented metadata contract
  (`client_reference_id` + `{userId, subscriptionId, referenceId}` on both metadata bags, against a
  pre-created `incomplete` row). Org Stripe customer created in `afterCreateOrganization` onto
  `organization.stripeCustomerId`. `authorizeReference` = **owner only**, inline role check, all
  five actions. Duplicate guard: reuse `incomplete`/`canceled` rows, 409 on `active`/`past_due`.
  Missing org id on a webhook **throws** so Stripe retries. Seam pinned by a pure params-builder
  vitest. All three [01](issues/01-better-auth-stripe-plugin-audit.md) checks cleared — `workerd`
  condition resolves (no `cryptoProvider` needed), `ui_mode: "embedded_page"`, 5 authorize actions.
- [06 — Subscription state model and how org status is derived](issues/06-subscription-state-model.md)
  — status is **derived live from the subscription row**, never stored on the org. Three states:
  `BILLING_STATUS = active | pending | past_due` (`pending` → resume checkout, `past_due` → billing
  portal). **`past_due` blocks immediately** (decided against the recommended Stripe-retry dunning
  window — policy is settled, not 07's to revisit). Plugin table adopted **verbatim**, trial/seat
  columns left unused. Org `metadata` emptied — column kept, `parseOrgMetadata`/`mergeOrgMetadata`
  deleted. **No KV cache on the gate**; the 5s poll survives only in the post-checkout confirming
  state. `org-status.ts` → `billing-status.ts`,
  `resolveBillingStatus(orgId): Promise<BillingStatus>`, a pure read with no lazy write.
- [07 — Webhook lifecycle and org deletion](issues/07-webhook-lifecycle-and-org-deletion.md) — the
  handler is **stateless and idempotent**: every subscription event re-retrieves from Stripe and
  writes what it says, so ordering stops mattering and **no `lastEventAt` column is added** (06's
  verbatim table holds). Org deletion is a raw `db.delete(organization)` behind a
  `deleteOrganizationCompletely` seam, **not** the plugin API (Stripe is the caller; no session to
  authorize with). An **FK `onDelete: "set null"` on `session.active_organization_id`** dissolves
  the dangling-pointer _and_ missing-org questions — the gate redirects before any billing read.
  `paused` maps on **`subscription.status` only**; `pause_collection` is never consulted, so a
  support pause keeps the org usable. **No `invoice.*` handlers at all** — every payment failure
  already arrives as a subscription status change, so dunning needs no code. Org-gone on a webhook →
  **logged 200** (exempted from 05's throw-to-retry); everything else unresolvable still throws.
  Signature verification is the plugin's. **No billing emails** — in-app banner only.
- [08 — Auth surface: signup, verification, reset, linking](issues/08-auth-surface-decisions.md) —
  **verification nags, never blocks** (`requireEmailVerification: false`, `autoSignIn: true`), so no
  wall sits on the compulsory-checkout revenue path. That trades away better-auth's enumeration-safe
  signup response, and the design **accepts enumeration end to end**: a 422 collision maps to "sign
  in with Google instead". Verified in installed source that **`requireLocalEmailVerified` defaults
  to `true`**, which closes the pre-registration takeover vector nag-mode would otherwise open — a
  version-pinned guarantee, now an upgrade watch item on
  [10](issues/10-write-spec-and-impl-tickets.md). Its price is an accepted UX cliff: unverified
  password user clicking "Continue with Google" gets `"account not linked"`, mapped to copy. Rate
  limiting goes to **KV via `rateLimit.customStorage`, not `secondaryStorage`** — sessions stay in
  D1. Separate auth routes, min-8 password with no composition rules, invite email →
  `/login?redirectTo=…` that survives the hop to `/signup`, single `BETTER_AUTH_DISABLE_SIGNUP` kill
  switch, Google-only password reset accepted, two new email templates.
- [09 — Onboarding flow, route gates and page UI](issues/09-onboarding-flow-and-gates.md) —
  `/onboarding/checkout` is **one self-confirming route** (`return_url` → itself as
  `?confirming=1`); **`/onboarding/success` deleted**. Gates branch on `resolveBillingStatus`:
  `pending` → checkout, `past_due` → `/payment-required` (portal CTA only), so
  **`PaymentRequiredBanner` is deleted** and the never-paid interstitial disappears. Confirming
  **polls the same DB read the gate uses, never `sessions.retrieve`** — the webhook stays sole
  writer; no timeout cap. The verify nag lives in `CommunityLayout`, which makes 08's
  banner-stacking question structurally impossible. Invite email prefilled **read-only**;
  **`BETTER_AUTH_DISABLE_SIGNUP` is absolute — invites break while it's on**, accepted. Portal link
  → "Manage billing", owners only. Prototype: [prototypes/09-screens.md](prototypes/09-screens.md).
- [10 — Write the spec and the implementation tickets](issues/10-write-spec-and-impl-tickets.md) —
  **destination reached.** [`PRD.md`](PRD.md) written, broken into eleven `ready-for-agent` impl
  issues
  [11](issues/11-stripe-plugin-and-schema.md)–[21](issues/21-analytics-and-stripe-test-mode-verification.md)
  along the spine `11 → 12 → 13 → 14 → 15/16 → 21`, with the auth chain `18 → 19/20` in parallel.
  Each ticket repeats the few facts that silently break it (`embedded_page`, the undocumented
  metadata bags, `pause_collection` vs `status: "paused"`, `requireLocalEmailVerified`) so an
  implementing agent reads one ticket, not the map.

**The map is complete — no open tickets. Hand off to an implementing agent, starting at
[11](issues/11-stripe-plugin-and-schema.md).**

## Not yet specified

_(nothing in the fog — the way to the destination is clear)_

<!-- graduated: "Login/signup page composition" — [08](issues/08-auth-surface-decisions.md) fixed the
     route table (separate /login, /signup, /forgot-password, /reset-password; no /verify-email page).
     The residual card layout and error states are line items on
     [09](issues/09-onboarding-flow-and-gates.md), not fog. -->
<!-- graduated: "Dunning" — [07](issues/07-webhook-lifecycle-and-org-deletion.md) resolved it to
     nothing: no `invoice.*` handlers, no billing emails. Every payment failure arrives as a
     subscription status change, which 06 already blocks on. Not a ticket, not fog — done. -->
<!-- graduated: "Failure/observability" — 07 settled the org-gone webhook arm (logged 200). The
     residue is PostHog event naming, now a spec line item on
     [10](issues/10-write-spec-and-impl-tickets.md), not fog. -->
<!-- graduated: "Emails" — [03](issues/03-email-password-auth-research.md) pinned it at exactly two new
     templates (verify email, reset password); copy is now a line item on
     [08](issues/08-auth-surface-decisions.md), not fog. -->
<!-- graduated: rate-limiting storage (KV vs D1) surfaced by [03] and is now a decision on [08]. -->
<!-- graduated: "Onboarding route shape" — [05](issues/05-checkout-architecture.md) landed the
     checkout architecture, so route layout, the fate of /onboarding/success and the gate rewrites
     are now line items on [09](issues/09-onboarding-flow-and-gates.md), not fog. -->

## Out of scope

_(nothing ruled out yet — everything surfaced so far sits inside the destination)_
