# 03 — Limit enforcement design

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: [01](01-better-auth-limit-hooks.md)

## Question

Given what the plugin supports, decide the exact mechanism for each cap:

- Organization limit on **create**: native `organizationLimit` fn (if it counts memberships) vs.
  custom `beforeCreateOrganization` hook.
- Organization limit on **invitation accept**: which hook, how count is read, error code.
- Member limit on **Org Members**: native `membershipLimit` vs. hook; pending-invite semantics.
- Member limit on **Community Profiles**: guard inside the profile-create server fn; count query.
- Shape of `src/lib/limits.ts` (constants + pure `canJoinOrganization(count)`-style predicates for
  vitest) and a `getUserOrganizationCount` query for the UI.
- Error contract to client for each (code → copy mapping).

## Comments

**Resolution** (grilled 2026-09-17, all recommendations accepted):

1. **Org limit on create** — native `organizationLimit: ORG_LIMIT` (5). No hook. Client sees 403
   `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS`.
2. **Org limit on accept** — `organizationHooks.beforeAcceptInvitation`:
   `countUserMemberships(user.id)` via Drizzle; if `!canJoinOrganization(n)` throw
   `new APIError("FORBIDDEN", { code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS", message })`
   — **reuse native code**, one code per cap regardless of path.
3. **Member limit on Org Members** — `beforeCreateInvitation`: count = `member` rows **+ pending
   invitations** for `organization.id`; if `!canInviteMember(n)` throw `APIError` w/ native code
   `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`. Native `membershipLimit: MEMBER_LIMIT` kept as backstop
   on accept/`addMember`. `invitationLimit: MEMBER_LIMIT` so the default 100-pending cap never bites
   first. Glossary: pending invitations reserve a Member-limit slot.
4. **Member limit on Community Profiles** — guard in both insert sites (`upsertMyCommunityProfile`
   create branch, userless admin create) via `countOrgProfiles(orgId)` + `canCreateProfile(n)`. No
   self-profile exemption: a new Org Member can be stuck until an admin frees a slot; copy must say
   so.
5. **File shape** — two files (map's "one file" amended): `src/lib/limits.ts` is pure/client-safe
   (`ORG_LIMIT`, `MEMBER_LIMIT`, `PROFILE_LIMIT = MEMBER_LIMIT`, `canJoinOrganization`,
   `canInviteMember`, `canCreateProfile`, `LIMIT_ERROR_CODES`, `LIMIT_COPY`) with vitest;
   `src/lib/limits-db.ts` holds Drizzle counters (`countUserMemberships`,
   `countOrgMembersAndPending`, `countOrgProfiles`), untested.
6. **Profile-cap error contract** — `throw new Error(LIMIT_COPY.profile)`; client toasts
   `error.message` (existing server-fn precedent). better-auth paths branch on `error.code` via
   `LIMIT_ERROR_CODES`.
7. **`n/5` source** — server fn `getMyOrganizationCount` in `src/api/organization.ts` +
   `queryOptions`, loaded in `/onboarding/create` loader; reuses `countUserMemberships`.
8. Count-then-insert race accepted as known limitation (document in whichever ADR ticket 04
   settles). Inviter-side "invitee at 5 orgs" warning **dropped** → Out of scope. One server-side
   PostHog event `limit_reached` `{ limit: "org" | "member" | "profile", organizationId }` fired
   from each block site.
