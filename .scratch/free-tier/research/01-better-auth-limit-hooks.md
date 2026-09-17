# Research 01 — better-auth organization plugin: limit + hook capabilities

Ticket: [issues/01-better-auth-limit-hooks.md](../issues/01-better-auth-limit-hooks.md) Sources:
installed `better-auth@1.6.29` (`package-lock.json` `node_modules/better-auth`; note
`node_modules/better-auth/package.json` reads `1.6.14` — stale dist metadata, lockfile is
authoritative) + official docs https://www.better-auth.com/docs/plugins/organization + repo skill
`.agents/skills/organization-best-practices/SKILL.md`. All paths below are under
`node_modules/better-auth/dist/plugins/organization/` unless noted.

## TL;DR

| Cap                                      | Native?                                                                                                                                                | Verdict                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Org limit on **create** (5 memberships)  | Yes — `organizationLimit: 5` counts memberships, not created orgs                                                                                      | Use native number.                                                           |
| Org limit on **invite accept**           | No native cap. `organizationHooks.beforeAcceptInvitation` fires before member insert; throw `APIError` to abort. Must count `member` rows via Drizzle. | Hand-roll in hook.                                                           |
| Member limit per org (1000)              | Yes — `membershipLimit: 1000` counts `member` rows only; enforced on **accept** + `addMember`, **not** on invite send                                  | Native for accept; hand-roll invite-send block via `beforeCreateInvitation`. |
| Community Profile cap                    | Not a plugin concern                                                                                                                                   | Hand-roll in `src/api`.                                                      |
| Org delete clears `activeOrganizationId` | Only for the **deleter's own** session; other members rely on D1 FK `onDelete: "set null"`                                                             | See Q6.                                                                      |

## 1. `organizationLimit`

- **Counts memberships, not created orgs.** `createOrganization` calls
  `adapter.listOrganizations(user.id)` then compares `.length >= organizationLimit`
  (`routes/crud-org.mjs:60-61`). `listOrganizations` is
  `findMany({ model: "member", where: userId, join: { organization: true } })`
  (`adapter.mjs:350-361`) — i.e. every org the user is a member of, any role. Matches MAP decision
  "5 total memberships per user, roles ignored".
- **Function form returns `boolean`, not number.** Type:
  `organizationLimit?: number | ((user) => Awaitable<boolean>)` (`types.d.mts:38`); JSDoc
  (`types.d.mts:26`): "return `true` if the user has reached their organization limit". Source:
  `typeof options.organizationLimit === "function" ? await options.organizationLimit(user) : false`
  (`crud-org.mjs:61`) — truthy = blocked. Async OK. Docs (#options) say the same shape
  (`number | ((user) => Promise<boolean> | boolean)`).
  - **Skill bug**: `organization-best-practices/SKILL.md:63-66` returns a number (`20 : 3`) from the
    function form — a number is truthy, so that example blocks _every_ create. Don't copy it.
- **Enforced only on** `POST /organization/create` (`crud-org.mjs:61`). Not on accept-invitation,
  not on `addMember`.
- **Error**: `APIError.from("FORBIDDEN", YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS)` →
  HTTP 403, body
  `{ code: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS", message: "You have reached the maximum number of organizations" }`
  (`error-codes.mjs:5`; `@better-auth/core/dist/error/index.mjs:19-24`;
  `@better-auth/core/dist/utils/error-codes.mjs:2-8`).
- Order of checks in create: session → `allowUserToCreateOrganization` → **`organizationLimit`** →
  slug uniqueness → `beforeCreateOrganization` → insert org → `beforeAddMember` → insert creator
  member → `afterAddMember` (`crud-org.mjs:56-104`). Limit is checked _before_ any write.
- Note `listOrganizations` uses `join`, so the D1/Drizzle adapter must support joins — it already
  does (existing `authClient.organization.list` usage works). Same count can also be read
  client-side for the `n/5` UI via `authClient.organization.list()` (`crud-org.mjs:399-416`).

## 2. Invitation accept cap (hand-rolled org limit)

- **Hook that fires**: `organizationHooks.beforeAcceptInvitation` — called in
  `POST /organization/accept-invitation` after invitation validity/recipient/email-verified checks
  and the `membershipLimit` check, **before** `updateInvitation(status: "accepted")` and
  `createMember` (`routes/crud-invites.mjs:274-283`).
- **`beforeAddMember` does NOT fire on accept.** Accept calls `adapter.createMember` directly
  (`crud-invites.mjs:307-312`); `beforeAddMember` is only invoked from `createOrganization`
  (`crud-org.mjs:85`) and `addMember` (`crud-members.mjs:74`). So the org-limit-on-accept check must
  live in `beforeAcceptInvitation`.
- **Context received**: `{ invitation, user, organization }` (`types.d.mts:533-537`). `user.id` =
  invitee (session user; `invitation.email` matched against `session.user.email` case-insensitively
  at `crud-invites.mjs:261`), `invitation.organizationId` / `organization.id` = target org. Return
  type `Promise<void>` — cannot mutate data, only veto.
- **Throwing `APIError` aborts cleanly**: hook runs before any write, so nothing to roll back. Error
  propagates through better-call: `isAPIError(error) → toResponse(error)`
  (`node_modules/better-call/dist/router.mjs:93`, `to-response.mjs:114-118`) → HTTP status from
  `APIError` status, JSON body = `{ message, code }`. Docs (#invitation-hooks): "Throwing an error
  in a `before` hook will prevent the operation from proceeding."
  - Throw a **non**-`APIError` → better-call logs `# SERVER_ERROR` and returns **500 with empty
    body** (`router.mjs:94-98`); client gets `error.code === undefined`. Always throw
    `new APIError("FORBIDDEN", { code: "...", message: "..." })` (import from `better-auth/api`).
- Side effects on success: `setActiveOrganization(session.token, invitation.organizationId)`
  (`crud-invites.mjs:313`) then `afterAcceptInvitation` (`:315`).
- Inviter-side awareness (MAP "Not yet specified"): `beforeCreateInvitation` receives
  `{ invitation: { email, role, organizationId, teamIds, inviterId }, inviter, organization }`
  (`crud-invites.mjs:201-210`). Invitee user is **not** resolved by the plugin (invitee may not
  exist yet). To warn, look up `user` by `invitation.email` via Drizzle, then count their `member`
  rows. Feasible but optional — soft warning only; the hard stop stays on accept.

## 3. `membershipLimit`

- **Counts `member` rows only**, not pending invitations: `adapter.countMembers` =
  `count({ model: "member", where: organizationId })` (`adapter.mjs:463-471`).
- **Enforced on accept** (`crud-invites.mjs:269-273`) and on **`addMember`**
  (`crud-members.mjs:61-65`). **Not enforced on `createInvitation`** — invite send only checks
  `invitationLimit` (pending invitations per org, default 100; `crud-invites.mjs:166-171`,
  `findPendingInvitations` `adapter.mjs:596`). So "Member limit blocks invite send" (MAP) needs a
  hand-rolled check in `beforeCreateInvitation` (count `member` rows for `organization.id`, throw
  `APIError`). Also raise/disable `invitationLimit` if 100 pending invites per org is too low for a
  1000-member org.
- Signature: `number | ((user, organization) => Awaitable<number>)` (`types.d.mts:53`); default 100.
  `|| 100` fallback means `0` is treated as 100 (`crud-invites.mjs:269`).
- Check is `count >= limit` → blocks the 1001st member when limit = 1000.
- **Error**: 403
  `{ code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED", message: "Organization membership limit reached" }`
  (`error-codes.mjs:35`). Note the accept path checks `membershipLimit` **before**
  `beforeAcceptInvitation` (`crud-invites.mjs:273` vs `:274`), so if both caps are hit the member
  cap error wins.
- `membersLimit` query param on `getFullOrganization` (`crud-org.mjs:297`) is a pagination cap on
  returned members, unrelated to enforcement.

## 4. Counting memberships

- No public helper for "count orgs of a user". `getOrgAdapter` is exported (`index.mjs:4`) but needs
  the internal `AuthContext` (`getOrgAdapter(ctx.context, options)`), which **hooks do not receive**
  (hook payloads are plain data: `types.d.mts:427-437, 533-537`). `listOrganizations(userId)` exists
  on the adapter but is only reachable inside endpoints.
- **Query the `member` table directly via Drizzle** inside the hook:
  `db.select({ n: count() }).from(member).where(eq(member.userId, user.id))` — same table the plugin
  reads (`src/db/auth-schema.ts:106`). Precedent: `getMember()` in `src/lib/auth.ts:65-69` already
  queries `memberTable` from inside the auth config. Put the counter in `src/lib/limits.ts` as a
  pure fn taking `userId` so it gets a vitest seam.
- Circular import caution: `src/lib/auth.ts` already imports `db`; hook may import `db` too.
- Race: count-then-insert is not atomic (same as plugin's own checks). Acceptable for a 5-cap
  pre-launch app; note as known limitation.

## 5. Client error shape

`authClient.organization.*` returns `{ data, error }`; `error` is
`{ status: number; statusText: string; message?: string; code?: string }`
(`@better-fetch/fetch/dist/index.d.ts:620-627`, body fields merged from the JSON response).
`statusText` is the `APIError` status name (`to-response.mjs:116`), e.g. `"FORBIDDEN"`.
`authClient.organization.$ERROR_CODES` exposes `ORGANIZATION_ERROR_CODES` for typed comparison
(`client.mjs:97`); project precedent: named constants in `src/lib/auth-copy.ts:14-16`.

| Trigger                                             | HTTP                                                                              | `error.code`                                           | `error.message`                                        |
| --------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| `create` at org cap (native)                        | 403                                                                               | `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS` | "You have reached the maximum number of organizations" |
| `create` when `allowUserToCreateOrganization` false | 403                                                                               | `YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION`     | "You are not allowed to create a new organization"     |
| `acceptInvitation` at member cap (native)           | 403                                                                               | `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`                | "Organization membership limit reached"                |
| `acceptInvitation` at org cap (our hook)            | whatever we throw — recommend 403 + custom code e.g. `ORGANIZATION_LIMIT_REACHED` | ours                                                   | ours                                                   |
| `inviteMember` at member cap (our hook)             | ours, same pattern                                                                | ours                                                   | ours                                                   |
| `inviteMember` at pending-invite cap (native)       | 403                                                                               | `INVITATION_LIMIT_REACHED`                             | "Invitation limit reached"                             |
| `acceptInvitation` invalid/expired/non-pending      | 400                                                                               | `INVITATION_NOT_FOUND`                                 | "Invitation not found"                                 |
| `acceptInvitation` wrong email                      | 403                                                                               | `YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION`          | "You are not the recipient of the invitation"          |
| Hook throws non-`APIError`                          | 500                                                                               | `undefined`                                            | `undefined` (empty body)                               |

Current `src/routes/_authed/onboarding/invitations/index.tsx:36-44` ignores `error.code` and shows a
generic toast — must branch on code for the new copy.

## 6. Danger-zone org delete and `activeOrganizationId`

- `POST /organization/delete` (`crud-org.mjs:238-293`): permission check → **if
  `organizationId === session.session.activeOrganizationId` for the caller, sets the caller's
  session `activeOrganizationId = null`** (`crud-org.mjs:275-278`, via
  `internalAdapter.updateSession`, `adapter.mjs:276-278`) → `beforeDeleteOrganization` →
  `adapter.deleteOrganization` (deletes `member`, `invitation`, then `organization` rows in a
  transaction, `adapter.mjs:249-274`) → `afterDeleteOrganization`.
- **Other members' sessions are NOT touched by the plugin.** Coverage comes from the project schema:
  `session.active_organization_id` has `references(() => organization.id, { onDelete: "set null" })`
  (`src/db/auth-schema.ts:37-39`), so D1 nulls it on delete — provided D1 has `PRAGMA foreign_keys`
  on (Cloudflare D1 enforces FKs by default). Same behaviour covers `deleteOrganizationCompletely`
  (`src/lib/billing-webhook.ts:46-49`), which bypasses the plugin. Caveat: if better-auth
  `session.cookieCache` is enabled, cached cookie sessions may still carry the stale id until
  refresh — not enabled in `src/lib/auth.ts` today.
- Danger-zone UI (`src/routes/_authed/_community/settings/overview/index.tsx:146-200`) already calls
  `authClient.organization.delete` then `router.invalidate()` + navigate to `/onboarding/create`;
  `_authed.tsx` gate handles the null active org. Freed slot: `member` rows are hard-deleted, so the
  org-limit count drops immediately (MAP: "no cooldown").
- `removeMember` / `leaveOrganization` also null the active org for the affected user's _current_
  session only (`crud-members.mjs:191`, `:378`).

## Recommended config (for the impl ticket)

```ts
organization({
	organizationLimit: ORG_LIMIT, // 5; native, counts memberships
	membershipLimit: MEMBER_LIMIT, // 1000; native on accept + addMember
	invitationLimit: MEMBER_LIMIT, // else 100 pending invites/org bites first
	organizationHooks: {
		beforeAcceptInvitation: async ({ user }) => {
			if ((await countUserMemberships(user.id)) >= ORG_LIMIT)
				throw new APIError("FORBIDDEN", { code: "ORGANIZATION_LIMIT_REACHED", message: "..." });
		},
		beforeCreateInvitation: async ({ organization }) => {
			if ((await countOrgMembers(organization.id)) >= MEMBER_LIMIT)
				throw new APIError("FORBIDDEN", {
					code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
					message: "...",
				});
		},
	},
});
```

## Open questions

- Reuse plugin code `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED` for our invite-send throw, or a distinct
  code?
- Custom code for org cap on accept: new `ORGANIZATION_LIMIT_REACHED` vs reuse native
  `YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS`?
- Inviter-side warning worth a user lookup by email in `beforeCreateInvitation`, or drop?
- Verify D1 FK enforcement (`onDelete: set null`) with a test, or trust it?
