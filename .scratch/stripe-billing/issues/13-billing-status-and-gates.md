# 13 — `resolveBillingStatus` and the route gates

Parent: [PRD.md](../PRD.md) §6, §8.2 Label: `impl` Status: `closed` Depends on:
[11](11-stripe-plugin-and-schema.md), [12](12-rip-out-polar-trial-and-seats.md)

## Goal

"May this org use the app" is derived live from the subscription row, and every gate branches on the
three-state result instead of a boolean.

## Scope

1. **`src/db/constants.ts`** — `ORGANIZATION_STATUS` →
   **`BILLING_STATUS = { active, pending, past_due }`**.
2. **`src/lib/org-status.ts` → `src/lib/billing-status.ts`**:
   ```ts
   export type BillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS];
   export async function resolveBillingStatus(orgId: string): Promise<BillingStatus>;
   ```
   One indexed read of `subscription` by `referenceId`, mapped through the table in PRD §6.
   - **Pure read.** The lazy write-on-read dies with the trial.
   - Returns the **bare status**, not the row. If a consumer later needs `periodEnd`, it queries for
     it — do not widen this signature speculatively.
   - Delete `ResolvedOrgStatus`, `OrgMetadata`, `parseOrgMetadata`, `trialEndsAt`, `inTrial`,
     `trialDaysLeft`, `getTrialDays`.
   - **No missing-org branch and no `throw new Error("Organization not found")` successor** — the FK
     from [11](11-stripe-plugin-and-schema.md) means `_authed` redirects before this is ever called
     with a dead org ([07](07-webhook-lifecycle-and-org-deletion.md) §3).
3. **`src/api/organization.ts`** — `getOrgStatus`/`getOrgStatusQuery` → `getBillingStatus` /
   `billingStatusQuery`, returning `BillingStatus`.
4. **`src/middleware/payment.ts`** — branch on the status: `pending` → redirect
   `/onboarding/checkout`, `past_due` → redirect `/payment-required`.
5. **`src/routes/_authed/_community.tsx`** — same three-way branch (PRD §8.2). It no longer passes
   an `orgStatus` object into `CommunityLayout`; strip that prop and its consumers of trial fields.
6. **`_authed.tsx`** — unchanged in shape, listed only so you verify the `/onboarding` escape hatch
   still holds (no `activeOrganizationId` **and not already under `/onboarding`** →
   `/onboarding/create`).

## The rule that must not be broken

**Never cache the derived status** — not in KV, not in a module-level map, not anywhere. It must
flip within seconds of a webhook landing; a stale read either locks out a paying customer or admits
an unpaid one. The `KV` binding stays out of this path entirely
([06](06-subscription-state-model.md) §6).

## Acceptance

- An org with no subscription row resolves `pending`; each Stripe status maps exactly as PRD §6
  tabulates (unit-test the mapping function if it is extractable without a DB).
- `grep -rn "ORGANIZATION_STATUS\|resolveOrgStatus\|org-status" src/` returns nothing.
- A `pending` org hitting `/dashboard` lands on `/onboarding/checkout`; a `past_due` org lands on
  `/payment-required`.
- `npm run build`, `format:fix`, `lint:fix` clean.

## Out of scope

The checkout and payment-required **pages** themselves ([15](15-checkout-page.md),
[17](17-payment-required-and-portal-link.md)) — this slice may leave them referencing the old shape
only if the build stays green; otherwise stub them and let those slices finish the job.

## Comments

Done. `getOrgStatus`/`getOrgStatusQuery` → `getBillingStatus`/`billingStatusQuery`. Mapping logic
extracted to `src/lib/billing-status-map.ts` — kept apart from `billing-status.ts` because that file
imports `db`, which pulls in `cloudflare:workers` and poisons any client-bundled importer (route
files import route-scoped constants at module scope, not just inside server fns). That split is also
what makes `mapSubscriptionStatus` unit-testable without a DB — added `billing-status.test.ts`
covering every row of the §6 table, plus a `vitest.config.ts` since none existed (the repo's
`vite.config.ts` carries the Cloudflare plugin, which vitest's default environment can't load).

Old shape didn't stay buildable once `ORGANIZATION_STATUS`/`getOrgStatus`/`ResolvedOrgStatus` were
deleted, so both `payment-required.tsx` and the redirect targets needed real fixes, not stubs:

- `payment-required.tsx` — patched to the new API with the full inverse guard from §8.2
  (`past_due` stays, everything else redirects out) rather than the old active-only check. Page
  content/copy is still [17](17-payment-required-and-portal-link.md)'s job.
- `onboarding/checkout/index.tsx` — didn't exist yet, so it's a real stub route (inverse guard +
  `?confirming=1` exception wired per §8.2, no Stripe iframe) so `redirect({ to: "/onboarding/checkout" })`
  type-checks. [15](15-checkout-page.md) fills in the actual page.
- `onboarding/success/index.tsx` — deleted now, not left for [15]. Nothing referenced it, and the PRD
  already calls it superseded by the checkout page's confirming state.
- `TrialBanner.tsx` deleted with its `CommunityLayout` usage — no trial exists post-[12].

Added `BILLING_STATUS_ROUTE` (in `billing-status-map.ts`, same cloudflare:workers reason) after
review flagged the status→redirect-target branch being reimplemented with raw string literals across
`payment.ts`, `_community.tsx`, `payment-required.tsx` and the checkout stub — one map, all four
sites index into it.
