# Billing foundation: tables, Dodo client, billingAccess

Status: resolved Blocked by:

## What to build

`orgBilling`, `billingWebhookEvent`, `billingNotice` tables + enums in `constants.ts` + migration.
`dodopayments` dep, `src/lib/dodo.ts` client factory, env typegen. Pure `billingAccess(row, now)` in
`src/domain/billing.ts` with exhaustive tests. Permission statement `billing: ["manage"]` (owner).

## Spec

[spec.md](../spec.md): Config, Data, State: `billingAccess`.

## Done when

- [ ] Every `billingAccess` rule tested both sides of each date boundary; cancel during Trial →
      `canceling` until `nextBillingDate`.
- [ ] Rows cascade on org delete.
- [ ] Only owners `can(actor, { billing: ["manage"] })`.
