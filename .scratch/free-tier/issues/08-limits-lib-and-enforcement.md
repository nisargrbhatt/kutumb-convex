# 08 — Limits lib + server-side enforcement

Parent: [PRD.md](../PRD.md) §2–§5, §10 Label: `impl` Status: `closed` Depends on:
[07](07-rip-stripe-billing.md)

## Goal

Both caps are enforced server-side at every block site, with a pure, unit-tested limits module and a
stable error contract the UI ([09](09-limit-ui.md)) can branch on. No UI in this slice.

## Scope

1. **`src/lib/limits.ts`** — exactly the contract in PRD §3: `ORG_LIMIT`, `MEMBER_LIMIT`,
   `PROFILE_LIMIT`, `canJoinOrganization`, `canInviteMember`, `canCreateProfile`,
   `LIMIT_ERROR_CODES`, `LIMIT_COPY` (verbatim, numbers interpolated). **No `db` import** — this
   file is imported by route modules and must be client-bundle-safe.
2. **`src/lib/limits.test.ts`** (vitest) — each predicate at `n-1`, `n`, `n+1`; `LIMIT_COPY` strings
   contain the interpolated number. `vitest.config.ts` already exists.
3. **`src/lib/limits-db.ts`** — PRD §4 counters using Drizzle on `member`, `invitation`
   (`status = "pending"`), `communityProfile`. Use `count()` from `drizzle-orm`, not `.length`.
4. **`src/lib/auth.ts`** `organization({...})` — add:
   ```ts
   organizationLimit: ORG_LIMIT,
   membershipLimit: MEMBER_LIMIT,
   invitationLimit: MEMBER_LIMIT,
   organizationHooks: {
   	beforeAcceptInvitation: async ({ user, invitation }) => {
   		const n = await countUserMemberships(user.id);
   		if (!canJoinOrganization(n)) {
   			captureLimitReached({ limit: "org", organizationId: invitation.organizationId, userId: user.id });
   			throw new APIError("FORBIDDEN", {
   				code: LIMIT_ERROR_CODES.org,
   				message: LIMIT_COPY.orgAccept.description,
   			});
   		}
   	},
   	beforeCreateInvitation: async ({ organization, inviter }) => {
   		const n = await countOrgMembersAndPending(organization.id);
   		if (!canInviteMember(n)) {
   			captureLimitReached({ limit: "member", organizationId: organization.id, userId: inviter.user.id });
   			throw new APIError("FORBIDDEN", {
   				code: LIMIT_ERROR_CODES.member,
   				message: LIMIT_COPY.memberInvite.description,
   			});
   		}
   	},
   },
   ```
   `APIError` from `better-auth/api`. Verify hook payload field names against the installed plugin's
   `types.d.mts` (research/01 §2 has line refs) — don't guess.
5. **Profile cap** in `src/api/communityProfile.ts`, both insert sites:
   - `upsertMyCommunityProfile` create branch (`if (!communityProfileItem)`): before the insert,
     `countOrgProfiles(organizationId)` → `!canCreateProfile(n)` → capture +
     `throw new Error(LIMIT_COPY.profileSelf.description)`.
   - `addMissingMember` (admin userless create): same guard, `LIMIT_COPY.profileAdmin.description`.
   - Update path untouched.
6. **`captureLimitReached`** — small helper in `src/lib/posthog-server.ts` (or `limits-db.ts`):
   `getPostHogClient().capture({ distinctId: userId, event: "limit_reached", properties: { limit, organizationId } })`.
   Fire-and-forget; never let PostHog failure block the throw.
7. **Server fns** in `src/api/organization.ts`, both `authMiddleware` + `queryOptions` factory:
   - `getMyOrganizationCount` → `{ count: number, limit: ORG_LIMIT }` via `countUserMemberships`.
   - `getOrgUsage` → `{ members: number, profiles: number, limit: MEMBER_LIMIT }` for the active
     org; throw if no `activeOrganizationId`.

## The rule that must not be broken

Hooks throw **`APIError` only**. A plain `Error` → better-call returns 500 with empty body and the
client sees `error.code === undefined`, which [09](09-limit-ui.md) cannot map to copy.

## Acceptance

- `npm run test` passes incl. `limits.test.ts`.
- 6th org create → 403 `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS` (native).
- User in 5 orgs accepting an invite → 403 with same code, message = `orgAccept.description`;
  invitation stays `pending`, no `member` row written.
- Org with `members + pending = 1000` sending invite → 403 `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`.
  (Verify by temporarily lowering `MEMBER_LIMIT` locally; restore before commit.)
- Org at 1000 profiles: self-create and admin-create both throw with the respective copy.
- `getMyOrganizationCount` / `getOrgUsage` return correct numbers via a quick loader call.
- `limits.ts` imports nothing from `@/db` or `cloudflare:workers`.
- `format:fix`, `lint:fix`, `build` clean.

## Out of scope

All UI (badge, alert, usage card, toast branching) → [09](09-limit-ui.md). ADR 0003 →
[10](10-docs-and-adrs.md).

## Comments

Implemented per contract: `src/lib/limits.ts` (verbatim PRD §3, no `db`/`cloudflare:workers`
import), `src/lib/limits.test.ts` (n-1/n/n+1 per predicate + `LIMIT_COPY` interpolation, 14 cases),
`src/lib/limits-db.ts` (3 Drizzle counters, `count()` not `.length`). `src/lib/auth.ts`
`organizationHooks` wired with `organizationLimit`/`membershipLimit`/`invitationLimit` +
`beforeAcceptInvitation`/`beforeCreateInvitation`, both throwing `APIError` only. Profile guard in
both `communityProfile.ts` insert sites (`upsertMyCommunityProfile` → `profileSelf`,
`addMissingMember` → `profileAdmin`). `captureLimitReached` added to `posthog-server.ts`,
fire-and-forget via try/catch. `getMyOrganizationCount` + `getOrgUsage` added to `organization.ts`
with `queryOptions` factories.

Verified the one thing the ticket flagged as unverified: step 4's pseudocode uses `inviter.user.id`
inside `beforeCreateInvitation`, but
`node_modules/better-auth/dist/plugins/organization/types.d.mts` types `inviter` as
`User & Record<string,any>` directly (not `{user: User}`) — used `inviter.id` instead. research/01
§2 corroborates.

`npm run build && npm run test && npm run format:fix && npm run lint:fix` all clean. `/code-review`
(Standards + Spec, parallel) ran clean — zero hard findings on either axis. Standards flagged 3
judgement-call smells only (guard duplication across 4 call sites, inconsistent `safeAsync` usage in
`limits-db.ts`'s counters, `getOrgUsage`'s single `limit` field covering two conceptually distinct
caps) — none blocking, left as-is since the `getOrgUsage` shape is spec-mandated verbatim (line
62-63 above) and the duplicated guards throw different error types (`APIError` vs plain `Error`) so
aren't free to dedupe.

Runtime acceptance checks (403 codes on real invite-accept/invite-send/org-create at cap,
temporarily lowering `MEMBER_LIMIT` locally) were not exercised — no local D1/wrangler dev loop was
spun up this pass; static verification (types, unit tests, build) is what's covered here.
