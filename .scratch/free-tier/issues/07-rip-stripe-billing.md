# 07 — Rip Stripe billing

Parent: [PRD.md](../PRD.md) §6, §8 Label: `impl` Status: `closed` Depends on: _nothing_

## Goal

No Stripe code, dep, schema, env, route, or gate remains. App boots straight from create-org into
the community shell. Build/lint/tests green with zero `stripe|billing|subscription|checkout|payment`
hits in `src/`.

## Scope

Authoritative path→action table: [research/02](../research/02-stripe-rip-inventory.md). Do it in
this order so the build stays green as long as possible:

1. **Delete 17 files** (research/02 §1 rows marked delete): `src/lib/stripe.ts`,
   `billing-status.ts`, `billing-status-map.ts`, `billing-status.test.ts`, `billing-webhook.ts`,
   `billing-portal-client.ts`, `checkout-session-params.ts` + `.test.ts`,
   `subscription-from-stripe.ts` + `.test.ts`, `org-stripe-customer.ts`,
   `src/middleware/payment.ts`, `src/api/billing.ts`, `src/routes/_authed/onboarding/checkout/`
   (whole dir), `src/routes/_authed/payment-required.tsx`.
2. **`src/lib/auth.ts`** — remove `stripe({...})` plugin entry, `onStripeEvent` + doc comment,
   `getMember`, the entire `organizationHooks: { afterCreateOrganization }` block, and now-unused
   imports (`stripe` type, `@better-auth/stripe`, `@/lib/stripe`, `memberTable`, `eq`/`and`,
   `createOrgStripeCustomer`, `billing-webhook`, `safeAsync`).
   `organization({ ac, roles, sendInvitationEmail })` stays intact —
   [08](08-limits-lib-and-enforcement.md) re-adds hooks.
3. **`src/lib/auth-client.ts`** — drop `stripeClient` → `plugins: [organizationClient()]`.
4. **`paymentMiddleware` → `authMiddleware`** in `src/api/communityProfile.ts` (13),
   `communityRelation.ts` (7), `communityAddress.ts` (3), `fields.ts` (3). Import path
   `@/middleware/payment` → `@/middleware/auth`. Handlers already guard `activeOrganizationId`.
5. **`src/routes/_authed/_community.tsx`** — delete `beforeLoad` + its imports. Layout-only.
6. **`src/api/organization.ts`** — remove `getBillingStatus`, `billingStatusQuery`, imports. Keep
   `listMyOrganizationInvitations`.
7. **`src/components/CommunityLayout/AuthUser.tsx`** — remove `openBillingPortal` import,
   `handleManageBilling`, owner-only "Manage billing" block, `CreditCard` icon; drop `toast` /
   `usePostHog` if now unused.
8. **Copy** — settings overview delete-org dialog: drop "and billing records";
   `(public)/privacy-policy`: remove "Billing data" bullet, "process subscriptions and payments",
   Stripe provider bullet; `(public)/term-of-service`: remove §4 "Subscriptions & billing",
   renumber.
9. **Schema** — `src/db/constants.ts` remove `BILLING_STATUS`; `src/db/auth-schema.ts` remove
   `user.stripeCustomerId`, `organization.stripeCustomerId`, `subscription` table. Then
   `npm run migration:generate` → commit `migrations/0003_*.sql` + meta. **Never edit
   `0002_icy_blue_blade.sql`** (holds unrelated session FK rebuild). Apply locally with
   `npm run migration:migrate:local`.
10. **Deps** — `npm uninstall @better-auth/stripe @stripe/react-stripe-js @stripe/stripe-js stripe`.
11. **Env** — delete the 5 `STRIPE_*` / `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` keys from local
    `.dev.vars`, run `npm run cf-typegen`, commit `worker-configuration.d.ts`.
12. `routeTree.gen.ts` regenerates on build — commit the result, never hand-edit.

## Acceptance

- `grep -riE "stripe|billing|subscription|checkout|payment" src/ package.json worker-configuration.d.ts`
  → only false positive is `src/components/ui/chart.tsx` ("payload").
- `migrations/0003_*.sql` drops `subscription` + both `stripe_customer_id` columns; `_journal.json`
  linear.
- Create org → lands on `/dashboard` and sees the community shell; no redirect to checkout.
- `/onboarding/checkout`, `/payment-required` 404.
- `npm run build && npm run test && npm run format:fix && npm run lint:fix` clean.

## Out of scope

Limits ([08](08-limits-lib-and-enforcement.md)), UI ([09](09-limit-ui.md)), docs
([10](10-docs-and-adrs.md)). Out-of-repo: delete the CF secrets (`wrangler secret delete` ×5) and
the Stripe dashboard webhook endpoint — list them in the PR description for the human.

## Comments

Done per research/02, in the file's prescribed order. 17 files deleted, `auth.ts`/`auth-client.ts`
stripped of the `stripe` plugin + `onStripeEvent`/`getMember`/`organizationHooks`, 26
`paymentMiddleware` → `authMiddleware` swaps across 4 api files (counts matched research exactly:
13/7/3/3), gate removed from `_community.tsx`, `AuthUser.tsx`/`organization.ts` billing exports
gone, legal/settings copy scrubbed, `subscription` table + both `stripe_customer_id` columns dropped
via `migrations/0003_known_nomad.sql` (journal stays linear, `0002` untouched), 4 stripe deps
uninstalled.

Gotcha not in the ticket: no `.dev.vars` exists locally — this repo's local secrets live in a
gitignored `.env` instead (picked up by `wrangler types`). Removed the 5 `STRIPE_*` keys from there
and re-ran `cf-typegen`; `worker-configuration.d.ts` now has zero Stripe entries. Also found `.env`
was separately missing `BETTER_AUTH_DISABLE_SIGNUP` (pre-existing drift, unrelated to this ticket —
`auth.ts` already reads it) — added an empty value so `cf-typegen`/`tsc` stay green.

`npm run build && npm run test && npm run format:fix && npm run lint:fix` all clean.
`grep -riE "stripe|billing|subscription|checkout|payment" src/ package.json worker-configuration.d.ts`
→ only `worker-configuration.d.ts`'s pre-existing `stripEtags` (workerd runtime type, unrelated,
predates this branch). `/code-review high` ran clean, zero findings.

Still needed from a human (out-of-repo, per Out of scope above): `wrangler secret delete` the 5
Stripe secrets on the deployed Worker, and delete the Stripe dashboard webhook endpoint.
