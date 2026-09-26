# 07 — /members/create → drawer from list, shared ProfileForm

Status: done Depends: 06 Review candidate: 4

## Spec

- Delete route `members/create/index.tsx`. `members/index.tsx` header `actions` = "Add member"
  button (shown when `useCan({ communityProfile: ["create"] })`), opens `<FormDrawer>` with
  `<ProfileForm mode="admin">`; submit → `useAddMissingMember()` → invalidate list + usage → toast →
  close.
- Any `Link to="/members/create"` (dashboard CTA etc.) → `/members?create=1`; list route
  `validateSearch` gains `create: z.boolean().optional()` and auto-opens the drawer, then strips the
  param.
- Server `addMissingMember` validator = `communityProfileInput.omit({ comment: true })`; sets
  `comment: "Added by <fullName(actorProfile) | actor email>"` and `status: "draft"` as today.

## Acceptance

- `routeTree.gen.ts` no longer has `/members/create`; `grep -rn "members/create" src` = 0.
- Add-member drawer and self-edit drawer render the same field set (single `ProfileForm`).

## Comments

Implemented. `members/create` route deleted; list header "Add member" (gated `useCan`) opens
`ProfileForm mode="admin"` via local `AddMemberDrawer`. Save = local `useAddMissingMember` (TODO
issue 09): `safeAsync` → invalidate `["get-community-members"]` prefix + usage → toast; limit →
`limitMessage`. `?create=1` → `z.coerce.boolean().catch(undefined)`, excluded from `loaderDeps` /
query key, auto-opens then stripped (`replace`). Only in-app link was the list button itself.

Server: validator unchanged (`communityProfileInput` has no `comment` → `.omit` n/a); comment =
`Added by <fullName(actor profile) | actor email>`, drops user id.

Fix: RHF `reset()` merges `resetOptions` (`keepDirtyValues: true`), so explicit resets kept dirty
fields — add-member reopened w/ previous member; `FormDrawer` Cancel never discarded self-edits
(06 bug). Both now pass `{ keepDirtyValues: false }`; admin resets to blank after submit.

Verified in browser (local): `?create=1` opens + strips; add → Draft row, comment "Added by Test
Person"; reopen blank after submit + after Cancel; `/profile/info` Edit still prefilled. tsc
(pre-existing `CommunityNav` only), lint, format, 111 tests.
