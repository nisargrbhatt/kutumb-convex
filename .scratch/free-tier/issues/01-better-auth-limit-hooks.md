# 01 — better-auth organization plugin: limit + hook capabilities

Parent: [MAP.md](../MAP.md) Label: `wayfinder:research` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder research agent) Blocked by: _nothing_

## Question

What does the better-auth organization plugin (version pinned in `package.json`) give us natively
for the two caps, and where must we hand-roll?

Answer against primary sources (better-auth docs + plugin source in `node_modules`):

1. **`organizationLimit`** — does it count orgs the user _created_ or orgs the user is a _member_
   of? Does it accept an async `(user) => boolean | number`? Which endpoint enforces it and what
   error code/message does the client see?
2. **Invitation accept cap** — which hook fires before `acceptInvitation` completes
   (`organizationHooks.beforeAcceptInvitation`? `beforeAddMember`?), what context it receives (user
   id, org id), and whether throwing an `APIError` from it aborts cleanly and reaches the client.
3. **`membershipLimit`** — counts members or members + pending invitations? Enforced on invite send
   or on accept? Error surfaced how?
4. **Counting memberships** — is there a plugin helper to count a user's memberships, or do we query
   the `member` table directly via Drizzle inside the hook?
5. **Client error shape** — for each of the above, exact `error.code` / `error.message` the
   `authClient.organization.*` call returns, so UI can map to copy.
6. **Danger-zone org delete** — does the plugin's `deleteOrganization` clear
   `session.activeOrganizationId` for members? (Relevant to fog on the map.)

Write findings to `.scratch/free-tier/research/01-better-auth-limit-hooks.md`.

## Comments

**Resolution** — see
[research/01-better-auth-limit-hooks.md](../research/01-better-auth-limit-hooks.md). Gist:
`organizationLimit` counts **memberships** (any role) → number `5` works natively on create (403
`YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS`); fn form returns boolean (truthy = blocked).
Accept cap = throw `APIError` from `organizationHooks.beforeAcceptInvitation` (`beforeAddMember`
does not fire on accept). `membershipLimit` counts `member` rows, enforced on accept/addMember only,
**not** invite send → hand-roll in `beforeCreateInvitation` + raise `invitationLimit`. Hooks get
plain data, no ctx → count via Drizzle in `src/lib/limits.ts`. Client error
`{status, code, message}`; `$ERROR_CODES` on client; invitations page currently ignores
`error.code`. `deleteOrganization` nulls only the deleter's `activeOrganizationId`; others via FK
`set null`; member rows hard-deleted → slot freed.
