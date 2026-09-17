# 02 — Stripe rip inventory

Parent: [MAP.md](../MAP.md) Label: `wayfinder:research` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder research agent) Blocked by: _nothing_

## Question

Enumerate everything in the repo that exists only because of Stripe billing, so the rip ticket is
mechanical. Local codebase only.

Produce a table: path → what to do (delete / edit: what changes / keep). Cover:

1. Files: `src/lib/billing-*.ts`, `src/lib/checkout-session-params*.ts`,
   `src/lib/subscription-from-stripe*.ts`, `src/lib/org-stripe-customer.ts`, `src/lib/stripe.ts`,
   `src/middleware/payment.ts`, `src/api/billing.ts`, `src/routes/_authed/onboarding/checkout/**`,
   `src/routes/_authed/payment-required.tsx`, tests.
2. Edits: `src/lib/auth.ts` (stripe plugin, `afterCreateOrganization` customer hook,
   `onStripeEvent`), `src/lib/auth-client.ts`, `src/routes/_authed/_community.tsx` gate,
   `src/api/organization.ts`, settings overview, `AuthUser.tsx`, privacy/ToS pages mentioning
   Stripe, `src/db/constants.ts` (`BILLING_STATUS`), `src/db/auth-schema.ts` (`subscription` table,
   `stripe_customer_id` cols).
3. Which server fns use `paymentMiddleware` → all become `authMiddleware`.
4. Deps to drop from `package.json`; env vars to drop from `worker-configuration.d.ts` /
   `wrangler.jsonc` / `.dev.vars.example`; `cf-typegen` implications.
5. Drizzle migrations: existing migration files that create the subscription table — drop-table
   migration vs. reset (map says DB may be cleared; recommend).
6. Docs: `docs/adr/0002-*`, CLAUDE.md Polar/Stripe mentions, `CONTEXT.md` (already updated).
7. Analytics: PostHog events emitted around checkout/billing that go away.

Write findings to `.scratch/free-tier/research/02-stripe-rip-inventory.md`.

## Comments

**Resolution** — see [research/02-stripe-rip-inventory.md](../research/02-stripe-rip-inventory.md).
Gist: 17 files delete outright; `auth.ts` loses stripe plugin + `onStripeEvent` + whole
`organizationHooks` block; 26 server fns swap `paymentMiddleware` → `authMiddleware` (handlers
already guard `activeOrganizationId`); 4 deps + 5 `STRIPE_*` env vars drop (CF secrets must be
deleted manually, `keep_vars: true`); Stripe DDL lives in `0002_icy_blue_blade.sql` alongside
non-Stripe session FK rebuild → forward `0003` migration, not rewrite; ADR 0002 bullet 1 void,
bullets 2-5 auth-only, keep/retitle; CLAUDE.md stale at 5 lines; 4 client PostHog events vanish;
`OnboardingForm` already navigates to `/dashboard` so onboarding needs only the `_community.tsx`
gate removed.
