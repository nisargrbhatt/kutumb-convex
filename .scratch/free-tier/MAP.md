# Map — Free app: rip Stripe billing, add organization + member limits

Label: `wayfinder:map` Status: `closed` — way is clear; execute [PRD.md](PRD.md) impl issues 07–10

## Destination

A spec at `.scratch/free-tier/PRD.md` plus numbered implementation issues under
`.scratch/free-tier/issues/`, sufficient for an agent to remove Stripe billing entirely (deps,
schema, webhook, checkout + payment-required routes, payment middleware, portal links) and enforce
two hard free-tier caps: **Organization limit** (a user belongs to ≤ 5 orgs, any role) and **Member
limit** (an org has ≤ 1000 Org Members and ≤ 1000 Community Profiles).

Planning only. Wayfinder sessions decide; a separate agent executes the impl tickets.

## Notes

- Domain: auth/organization + onboarding on TanStack Start / Cloudflare Workers / D1 + Drizzle /
  better-auth (organization plugin). Glossary: `CONTEXT.md` (Organization limit, Member limit).
- Skills every session should consult: `/better-auth-best-practices`,
  `/organization-best-practices`, `/tanstack-start-best-practices`,
  `/tanstack-query-best-practices`. Use `/grilling` + `/domain-modeling` for grilling tickets.
- App is pre-launch. **DB may be cleared**; dropping the `subscription` table and
  `stripe_customer_id` columns needs no migration path. No rows over cap exist; no backfill.
- CLAUDE.md still says "billing is Polar" — stale; billing is Stripe via `@better-auth/stripe`. Impl
  tickets must fix CLAUDE.md too.
- Prior effort: `.scratch/stripe-billing/` (what is being ripped). ADR 0002 documents the Stripe
  tradeoffs and must be marked superseded.

## Decisions so far

- Destination is a spec + impl tickets, not the implementation itself.
- **Full rip** of Stripe: no dormant flag, no kept code. A future paid tier is a fresh effort.
- **Organization limit = 5 total memberships per user**, roles ignored. Bites on org create and
  invitation accept. Invite _send_ is not blocked by the invitee's count. Leaving/removal/org
  deletion frees the slot immediately; no cooldown.
- **Member limit = 1000 per org**, applied separately to Org Members (invite send blocked) and
  Community Profiles (profile create blocked).
- Both caps are **hardcoded constants** in `src/lib/limits.ts` (pure) + `src/lib/limits-db.ts`
  (Drizzle counters); no env var, no per-org override.
- Onboarding after rip: create org → community directly. `/onboarding/checkout` and
  `/payment-required` deleted; `/onboarding/create` + `/onboarding/invitations` kept.
- Limit UI: create-org page shows `n/5` and disables the button at cap; invite accept surfaces a
  clear error; profile create surfaces a clear error at cap.
- Glossary updated in `CONTEXT.md`: Organization limit, Member limit added; Billing status,
  Subscription row, Pending, Past due removed.
- [02 — Stripe rip inventory](issues/02-stripe-rip-inventory.md) — 17 files delete; `auth.ts` loses
  stripe plugin, `onStripeEvent`, whole `organizationHooks` block; 26 server fns `paymentMiddleware`
  → `authMiddleware`; 4 deps + 5 `STRIPE_*` env (CF secrets deleted by hand); **forward `0003` drop
  migration** (0002 also holds non-Stripe session FK rebuild); ADR 0002 bullet 1 void, 2-5 keep; 4
  PostHog events vanish; onboarding needs only the `_community.tsx` gate removed.
- [01 — better-auth limit + hook capabilities](issues/01-better-auth-limit-hooks.md) —
  `organizationLimit: 5` counts memberships natively (create only); accept cap via `APIError` in
  `beforeAcceptInvitation`; `membershipLimit` not enforced on invite send → hand-roll in
  `beforeCreateInvitation`; hooks lack ctx → Drizzle counts in `src/lib/limits.ts`; org delete frees
  slot immediately, other members' `activeOrganizationId` cleared by FK `set null`.
- [03 — Limit enforcement design](issues/03-limit-enforcement-design.md) — create: native
  `organizationLimit`; accept: `beforeAcceptInvitation` + Drizzle count, reuse native code; invite
  send: `beforeCreateInvitation` counts members **+ pending**, native `membershipLimit` backstop,
  `invitationLimit` raised; profile cap guards both insert sites, no self-profile exemption; pure
  `limits.ts` (vitest) + `limits-db.ts`; profile errors plain `Error(copy)`;
  `getMyOrganizationCount` server fn for `n/5`; one `limit_reached` PostHog event; race accepted.
- [04 — Onboarding flow and route gates after the rip](issues/04-onboarding-and-gates-post-rip.md) —
  `_community.tsx` loses `beforeLoad` (plain shell, `billing-status-map.ts` deleted); create →
  `/dashboard` unchanged; accept-invite → navigate `/dashboard`, toast shows `error.message`;
  settings overview **adds** org-usage block (`getOrgUsage`, visual → 05), "billing records" copy
  fixed; `AuthUser` "Manage billing" removed, no replacement; ADR 0002 bullet 1 deleted + retitled
  "Auth known limitations" + amended note, not superseded; new ADR 0003 "Hardcoded free-tier limits"
  (3 bullets) written by impl ticket.
- [05 — Limit UI prototype](issues/05-limit-ui-prototype.md) — both variant **A**: create-org `n/5`
  Badge in title + destructive Alert + disabled Create at cap; settings "Usage" Card with two
  Progress rows `n / 1000`; errors are sonner toasts; `LIMIT_COPY` = "actionable" set (verbatim in
  ticket). Prototype on branch `prototype/limit-ui`.
- [06 — Write PRD and implementation tickets](issues/06-write-spec-and-impl-tickets.md) —
  [PRD.md](PRD.md) + impl issues [07 rip](issues/07-rip-stripe-billing.md) →
  [08 limits + enforcement](issues/08-limits-lib-and-enforcement.md) →
  [09 UI](issues/09-limit-ui.md) ∥ [10 docs](issues/10-docs-and-adrs.md), all `ready-for-agent`.
  **Destination reached.**

## Not yet specified

_Empty — frontier reaches the destination._

## Out of scope

- Per-org overrides / paid tier / any billing reinstatement.
- Cooldown or anti-abuse on rapid leave/rejoin.
- Inviter-side warning when invitee is at their Organization limit (03): hard stop on accept is
  enough; user-by-email lookup not worth it.
- Migration of existing subscription rows (none exist that matter).
