# Org lifecycle and the Dodo customer

Type: grilling Status: resolved Blocked by: 01, 02, 11

## Question

When and how is the Dodo customer created and kept in step with the org? Eagerly in
`afterCreateOrganization` or lazily at first checkout? What if Dodo is down during org create (org
created anyway?)? Org rename → customer name sync? Billing email when the owner who created it
leaves, is demoted or transfers ownership? Org delete → cancel Subscription (and customer?).
Interaction with ORG_LIMIT and with a user re-creating orgs to farm Trials (abuse: allow, cap, or
ignore?).

## Comments

- From plugin research (02): verify in Test Mode whether Dodo allows several customers with the same
  email (one owner, many orgs). Customer id stored on our org billing row, not on `user`.
- From 03: checkout given an email (not `customer_id`) merges into the existing customer with that
  email → one owner's orgs would share a customer + portal. Always pass the org's `customer_id` or
  `always_create_new_customer`. Can a card-less trial be created server-side without checkout?
- From 01: "Prevent Trial Misuse" matches by email → owner's 2nd org gets no trial; keep it off or
  pass `trial_period_days`. No delete-customer API. Portal per customer → customer per org scopes
  it.
- From 11: duplicate emails allowed → one Dodo customer per org works. Card-less sub can be created
  server-side at org create (`POST /subscriptions`, deprecated in SDK) — but it takes a `billing`
  address we don't have at org create; decide: required? dummy/country-only? or start sub lazily.
- From 05: decided eager — org create creates customer + card-less sub server-side (ADR 0013);
  create form collects billing address. Left here: which address fields, Dodo-down behaviour (org
  still created, `needsSubscription`, trials from `org.createdAt`; retry how?), re-subscribe
  checkout uses `trial_period_days: 0`.

## Answer

Grilled 2026-11-14. Dodo facts (API docs): `billing` needs only `country` (city/state/street/zipcode
optional); `PATCH /customers/{id}` updates `email`, `name`, `phone_number`, `metadata`; immediate
cancel = `PATCH /subscriptions/{id}` `status: "cancelled"`.

1. **Create path:** own server fn (not client `authClient.organization.create`, not hook). Validates
   form (zod), calls `auth.api.createOrganization` server-side (ORG_LIMIT + hooks still apply), then
   Dodo customer (name = org name, email = creator) + card-less sub, writes `orgBilling`.
2. **Address:** country only, required select on create form. Owners fix the rest in Dodo portal.
3. **Dodo down:** org created anyway; `orgBilling` row with `needsSubscription`, stored country,
   `dodoCustomerId` if customer step succeeded. Idempotent `ensureSubscription` retries: on owner
   billing page / dashboard load + periodic sweep (mechanism → 09). Never creates a 2nd customer;
   only retries the missing step. Trial from `org.createdAt` meanwhile (05).
4. **Rename:** `afterUpdateOrganization` → `PATCH` customer `name`, best-effort (`safeAsync`, log).
5. **Billing email:** creator's at create. When that user stops being an owner (leave, demote via
   role update, removal) → switch to longest-standing remaining owner. Owner's own email change not
   synced. Leave fires no `afterRemoveMember`: hook the existing `after` middleware path
   (`src/lib/auth-hooks.ts`), like Connections. No user-delete feature exists today; if added, same
   rule. better-auth already blocks the last owner leaving.
6. **Org delete:** `beforeDeleteOrganization` → cancel sub immediately (no refund). Dodo error →
   block delete ("try again"). Skip if no sub or terminal. Dodo customer stays (no delete API).
   `orgBilling` row deleted with org; webhooks for unknown org ignored (ack 200).
7. **Trial farming:** ignore for v1. Store `createdByUserId` on `orgBilling` + PostHog event at
   create; revisit if abused.

No ADR (all reversible). No new glossary terms.
