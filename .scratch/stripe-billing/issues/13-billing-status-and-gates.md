# 13 — `resolveBillingStatus` and the route gates

Parent: [PRD.md](../PRD.md) §6, §8.2 Label: `impl` Status: `ready-for-agent` Depends on:
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
