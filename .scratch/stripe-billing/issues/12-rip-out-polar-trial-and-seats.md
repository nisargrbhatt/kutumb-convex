# 12 — Rip out Polar, the trial and seat metering

Parent: [PRD.md](../PRD.md) §12 Label: `impl` Status: `ready-for-agent` Depends on:
[11](11-stripe-plugin-and-schema.md)

## Goal

Polar is gone from the codebase, and the org Stripe customer hook replaces the Polar one. The app
will not be fully coherent until [13](13-billing-status-and-gates.md) lands — that is expected;
these two slices are a pair.

## Scope

**Delete outright:**

- `src/lib/polar.ts`, `src/routes/api/polar/portal.ts`
- the whole `polar()` block in `src/lib/auth.ts` (`:256-335`) — `checkout`, `portal`, `usage` and
  all four webhook handlers
- `polarClient()` from `src/lib/auth-client.ts`
- deps `@polar-sh/better-auth`, `@polar-sh/sdk`, `@polar-sh/tanstack-start`
- env `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_MODE`, `POLAR_WEBHOOK_SECRET`, `TRIAL_DAYS`
  from wrangler config/secrets, then `npm run cf-typegen`

**Trial machinery:** the `beforeCreateOrganization` trial stamp (`src/lib/auth.ts:73-85`),
`getTrialDays`, `TRIAL_DAYS`, and every trial string in the UI.

**Seat metering:** the `org_seat` `events.ingest` calls in `afterRemoveMember` and
`afterAcceptInvitation`, plus the **commented-out `afterAddMember` block** (`:154-203`) — it exists
only to explain a Polar quirk, so it goes with Polar.

Both hooks become either no-ops (delete them) or keep only genuinely non-billing work. Read them
before deleting — everything they currently do is seat metering.

**Replace `afterCreateOrganization`** (`:88-104`) with the Stripe equivalent (PRD §7.2):

```ts
afterCreateOrganization: async (payload) => {
  // best-effort; never blocks org creation
  const customer = await safeAsync(stripe.customers.create(
    { email: payload.user.email, name: payload.organization.name,
      metadata: { organizationId: payload.organization.id } },
    { idempotencyKey: `org-customer:${payload.organization.id}` }
  ));
  if (!customer.success) { console.error(...); return; }
  await db.update(organization)
    .set({ stripeCustomerId: customer.data.id })
    .where(eq(organization.id, payload.organization.id));
}
```

Stripe has **no `externalId` uniqueness** like Polar's — the idempotency key plus
`metadata.organizationId` are the guard. Because it is best-effort,
[14](14-create-checkout-session.md) adds a lazy `ensureOrgStripeCustomer` fallback.

**Metadata helpers:** delete `mergeOrgMetadata` (`src/lib/auth.ts:22`). `parseOrgMetadata`,
`OrgMetadata` and `resolveOrgStatus` die with `src/lib/org-status.ts` in
[13](13-billing-status-and-gates.md) — leave the file alone here if it keeps the build green, or
coordinate the two slices in one branch.

**Keep** the `organization.metadata` text column — the org plugin owns it and it stays free for
non-billing config. `OnboardingForm` keeps writing `{}`.

**Update prose:** `src/routes/(public)/privacy-policy/index.tsx` names Polar as the payment
processor. It must name Stripe.

## Acceptance

- `grep -ri polar src/` returns **only** `src/components/ui/chart.tsx` (Recharts `PolarAngleAxis`)
  and `routeTree.gen.ts`. The privacy-policy hit is gone because the prose now says Stripe.
- `grep -ri "trial\|org_seat\|TRIAL_DAYS" src/` returns nothing outside the plugin's unused
  `trialStart`/`trialEnd` schema columns.
- No `@polar-sh/*` in `package.json` or the lockfile.
- Creating an org produces a Stripe customer in test mode and writes
  `organization.stripeCustomerId`; making `customers.create` fail still lets org creation succeed.
- `npm run build`, `format:fix`, `lint:fix` clean.

## Out of scope

Billing-status derivation and the gates ([13](13-billing-status-and-gates.md)).
