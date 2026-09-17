# PRD — Free app: rip Stripe billing, add Organization + Member limits

Status: `ready-for-agent` Map: [MAP.md](MAP.md) · decided across tickets
[01](issues/01-better-auth-limit-hooks.md)–[05](issues/05-limit-ui-prototype.md) Impl issues:
[`issues/07`](issues/07-rip-stripe-billing.md) … [`issues/10`](issues/10-docs-and-adrs.md)

Every statement below was decided on a wayfinder ticket. Load-bearing lines name the ticket that
owns them — **read that ticket before changing the behaviour**, not just this file.

## 1. Goal

Kutumb becomes a free app with two hard caps. No billing code remains.

- **Full rip** of Stripe: deps, schema, webhook, checkout + payment-required routes,
  `paymentMiddleware`, portal links. No dormant flag, no kept code. A future paid tier is a fresh
  effort ([MAP](MAP.md) Decisions).
- **Organization limit** — a user belongs to ≤ **5** organizations, any role. Bites on org create
  and invitation accept. Invite _send_ is not blocked by the invitee's count. Leaving / removal /
  org deletion frees the slot immediately, no cooldown.
- **Member limit** — an org has ≤ **1000** Org Members (member rows **+ pending invitations**) and,
  separately, ≤ **1000** Community Profiles (any status, linked or userless). Bites on invite send
  and profile create respectively. No self-profile exemption.
- Both caps are **hardcoded constants**; no env var, no per-org override
  ([03](issues/03-limit-enforcement-design.md)).

Pre-launch app. **DB may be cleared**; no backfill, no rows over cap exist. Glossary already in
`CONTEXT.md` (working-tree edit, uncommitted — [10](issues/10-docs-and-adrs.md) commits it).

## 2. Architecture in one page

| Concern                                   | Mechanism                                                                                                                                   | Ticket                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Org limit on **create**                   | native `organizationLimit: ORG_LIMIT` — counts memberships, 403 `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS`                      | [01](issues/01-better-auth-limit-hooks.md), [03](issues/03-limit-enforcement-design.md) |
| Org limit on **accept**                   | `organizationHooks.beforeAcceptInvitation` + Drizzle `countUserMemberships`; throw `APIError` reusing the **native code**                   | [03](issues/03-limit-enforcement-design.md)                                             |
| Member limit on **invite send**           | `organizationHooks.beforeCreateInvitation` + `countOrgMembersAndPending`; throw `APIError` `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`          | [03](issues/03-limit-enforcement-design.md)                                             |
| Member limit backstop on accept/addMember | native `membershipLimit: MEMBER_LIMIT`; `invitationLimit: MEMBER_LIMIT` so default 100-pending cap never bites first                        | [03](issues/03-limit-enforcement-design.md)                                             |
| Profile limit                             | guard in **both** insert sites of `src/api/communityProfile.ts` via `countOrgProfiles` + `canCreateProfile`; `throw new Error(LIMIT_COPY…)` | [03](issues/03-limit-enforcement-design.md)                                             |
| Pure limit logic (vitest)                 | `src/lib/limits.ts` — client-safe, no `db` import                                                                                           | [03](issues/03-limit-enforcement-design.md)                                             |
| Counters                                  | `src/lib/limits-db.ts` — Drizzle, server-only, untested                                                                                     | [03](issues/03-limit-enforcement-design.md)                                             |
| `n/5` on create-org page                  | `getMyOrganizationCount` server fn + `queryOptions`, loaded in `/onboarding/create` loader                                                  | [03](issues/03-limit-enforcement-design.md), [05](issues/05-limit-ui-prototype.md)      |
| Usage block in settings overview          | `getOrgUsage` server fn (`members`, `profiles`) + `queryOptions`                                                                            | [04](issues/04-onboarding-and-gates-post-rip.md), [05](issues/05-limit-ui-prototype.md) |
| Analytics                                 | one server-side PostHog event `limit_reached` `{ limit: "org" \| "member" \| "profile", organizationId }` from each block site              | [03](issues/03-limit-enforcement-design.md)                                             |

## 3. `src/lib/limits.ts` (pure) — contract

```ts
export const ORG_LIMIT = 5;
export const MEMBER_LIMIT = 1000;
export const PROFILE_LIMIT = MEMBER_LIMIT;

export const canJoinOrganization = (membershipCount: number) => membershipCount < ORG_LIMIT;
export const canInviteMember = (membersPlusPending: number) => membersPlusPending < MEMBER_LIMIT;
export const canCreateProfile = (profileCount: number) => profileCount < PROFILE_LIMIT;

export const LIMIT_ERROR_CODES = {
	org: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
	member: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
} as const;

export const LIMIT_COPY = {
	orgCreate: {
		title: `You're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one to create a new organization. Limit is ${ORG_LIMIT} per account.`,
	},
	orgAccept: {
		title: `Can't accept — you're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one, then accept this invite. Limit is ${ORG_LIMIT} per account.`,
	},
	memberInvite: {
		title: "Member limit reached",
		description: `This organization has ${MEMBER_LIMIT} members or pending invites. Remove a member or revoke an invite to send a new one.`,
	},
	profileAdmin: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles. Delete a profile to add another.`,
	},
	profileSelf: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles, so your profile can't be created yet. Ask an admin to free a slot.`,
	},
} as const;
```

Copy is verbatim from [05](issues/05-limit-ui-prototype.md) ("actionable" set). Error codes reuse
better-auth's native ones — one code per cap regardless of path
([03](issues/03-limit-enforcement-design.md) §2, §3).

## 4. `src/lib/limits-db.ts` (Drizzle) — contract

```ts
export async function countUserMemberships(userId: string): Promise<number>; // member rows for user
export async function countOrgMembersAndPending(orgId: string): Promise<number>; // member rows + invitation rows status="pending"
export async function countOrgProfiles(orgId: string): Promise<number>; // communityProfile rows, any status
```

Imports `db` → never import from client-bundled files (route modules, components). Same split
rationale as the old `billing-status` / `billing-status-map` pair.

## 5. Error contract to client

| Path                  | Transport                                                                                                 | Client branch                                                                                                            | Copy                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Org create at cap     | better-auth 403, `error.code = LIMIT_ERROR_CODES.org`                                                     | `OnboardingForm` — button already disabled; toast on code as fallback                                                    | `LIMIT_COPY.orgCreate`                                               |
| Invite accept at cap  | `APIError("FORBIDDEN", { code: LIMIT_ERROR_CODES.org, message: LIMIT_COPY.orgAccept.description })`       | invitations page: `error.code === LIMIT_ERROR_CODES.org` → `toast.error(orgAccept.title, { description })`; else generic | `LIMIT_COPY.orgAccept`                                               |
| Invite send at cap    | `APIError("FORBIDDEN", { code: LIMIT_ERROR_CODES.member, message: LIMIT_COPY.memberInvite.description })` | members page: branch on code likewise                                                                                    | `LIMIT_COPY.memberInvite`                                            |
| Profile create at cap | `throw new Error(copy.description)` from server fn                                                        | client `toast.error(title, { description: error.message })` (existing server-fn precedent)                               | `profileSelf` (self create) / `profileAdmin` (admin userless create) |

Always throw **`APIError` from `better-auth/api`** inside hooks — a plain `Error` becomes a 500 with
empty body and `error.code === undefined` ([01](issues/01-better-auth-limit-hooks.md) §2).

## 6. Post-rip routing

- `_authed/_community.tsx` loses `beforeLoad` entirely → plain layout shell. `_authed.tsx` already
  redirects no-session → `/login`, no-`activeOrganizationId` → `/onboarding/create`.
- `/onboarding/checkout/**`, `/payment-required.tsx` deleted; `routeTree.gen.ts` regenerated.
- Post-create-org: unchanged (`OnboardingForm` already navigates `/dashboard`).
- Post-accept-invite: navigate `/dashboard` after success (better-auth sets accepted org active).
- `AuthUser.tsx`: "Manage billing" item gone, nothing replaces it.
  ([04](issues/04-onboarding-and-gates-post-rip.md))

## 7. UI (winners from [05](issues/05-limit-ui-prototype.md), variant A everywhere)

- **`/onboarding/create`**: `Badge` `n/5` inline in `CardTitle` (`secondary`; `destructive` at cap).
  At cap: `destructive` `Alert` (Lock icon, `LIMIT_COPY.orgCreate` title + description) above the
  form, Create button `disabled`. Form stays visible.
- **Settings overview**: `Card` "Usage", description "Free plan limits for this organization.", two
  `Progress` rows (`Org Members`, `Community Profiles`) with label + mono `n / 1000` value; value
  `text-destructive` at cap, amber ≥ 90%. Sits between `OrganizationForm` and `DangerZone`.
- Invite-accept / invite-send / profile-create errors: sonner `toast.error(title, { description })`
  only. No inline UI.
- Primary source: branch `prototype/limit-ui` (`f06ab66`). Impl **rewrites** the winner cleanly;
  prototype switcher / variant files / `OnboardingForm` slots are **not** kept.

## 8. Rip inventory

Authoritative list: [research/02](research/02-stripe-rip-inventory.md). Summary:

- **17 files delete** (`src/lib/stripe.ts`, `billing-*.ts` ×4 incl. test,
  `billing-portal-client.ts`, `checkout-session-params*.ts` ×2, `subscription-from-stripe*.ts` ×2,
  `org-stripe-customer.ts`, `src/middleware/payment.ts`, `src/api/billing.ts`,
  `routes/_authed/onboarding/checkout/**` ×3, `routes/_authed/payment-required.tsx`).
- **`src/lib/auth.ts`**: drop stripe plugin entry, `onStripeEvent`, `getMember`, the whole existing
  `organizationHooks` block (only `afterCreateOrganization`), related imports.
- **26 server fns** in `communityProfile.ts` (13), `communityRelation.ts` (7), `communityAddress.ts`
  (3), `fields.ts` (3): `paymentMiddleware` → `authMiddleware`.
- **Schema**: drop `subscription` table, `user.stripeCustomerId`, `organization.stripeCustomerId`,
  `BILLING_STATUS` constant → **forward migration `0003`** via `npm run migration:generate` (0002
  also holds non-Stripe session FK rebuild — never rewrite it).
- **Deps**: `@better-auth/stripe`, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `stripe`.
- **Env**: `STRIPE_PRODUCT_ID`, `STRIPE_PRICE_ID`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` — from local `.dev.vars` then `npm run cf-typegen`. CF
  secrets + Stripe webhook endpoint deleted by hand (out of repo).
- **Copy**: privacy-policy + ToS Stripe sections, settings "and billing records".
- **Analytics**: `checkout_started`, `payment_completed`, `billing_portal_opened` vanish.

## 9. Docs

- **CLAUDE.md**: remove Polar/billing lines; `src/api/*` example → real one; `_community.tsx`
  description → plain shell; "Billing & analytics" → "Analytics".
- **ADR 0002**: delete bullet 1, retitle "Auth known limitations", add amendment note. Not
  superseded ([04](issues/04-onboarding-and-gates-post-rip.md)).
- **New ADR 0003 "Hardcoded free-tier limits"**, 3 bullets: constants not config; pending
  invitations reserve Member-limit slots; count-then-insert race accepted.
- **CONTEXT.md**: already edited in working tree; commit with docs ticket.

## 10. Known limitations (accepted)

- Count-then-insert **race**: two concurrent creates can overshoot a cap by one. Accepted
  ([03](issues/03-limit-enforcement-design.md) §8).
- Accept path checks native `membershipLimit` **before** `beforeAcceptInvitation`; if both caps are
  hit the member-limit error wins ([01](issues/01-better-auth-limit-hooks.md) §3).
- A new Org Member can be stuck without a profile until an admin frees a slot (no self-profile
  exemption); `profileSelf` copy says so.

## 11. Out of scope

Per-org overrides / paid tier; cooldown on leave/rejoin; inviter-side "invitee at 5 orgs" warning;
migration of existing subscription rows.
