# 08 — Relations UI unified across /profile/relationships and /members/$id

Status: done Depends: 04 Review candidates: 4, 6 (partial) · ADR-0001 unchanged (incoming
shown un-inverted)

## Why

Relation editing exists twice with divergent containers (Dialog vs Sheet), two `RelationsTable`s,
two delete confirms; `members/$id/index.tsx` is 1043 lines.

## Spec

### `src/components/relations/`

- `RelationsTable rows direction="outgoing"|"incoming" onDelete?` — shadcn simple `Table`, uses
  `formatRelationType`, `ProfileName`. Incoming rows have no delete (owned by counterpart).
- `RelationForm subjectId excludeIds onSubmit isPending` — `Combobox` over
  `activeProfilesForRelationQuery(subjectId)` + `relationTypeSchema` select. Used inside
  `FormDrawer`.
- Delete via `ConfirmDialog`.

### Routes

- `profile/relationships/index.tsx` — `PageHeader actions="Add relation"` →
  `FormDrawer`+`RelationForm` → `useAddMyRelation()`; tables via `RelationsTable`; delete →
  `useDeleteMyRelation()`.
- `members/$id/index.tsx` — split into `-components/`: `MemberActions.tsx` (accept/reject/reassign;
  reassign stays a `FormDrawer`), `MemberRelations.tsx` (same two modules with
  `useAddRelationToProfile(id)` / `useDeleteRelationFromProfile(id)`, gated by
  `useCan({ communityProfile: ["manageRelations"] })`). Route file composes `PageHeader`,
  `ProfileInfoView`, `MemberActions`, `MemberRelations`.
- Server: `addMyCommunityRelationship` and `addCommunityRelationToProfile` share one
  `insertRelation(actor, { fromId, toId, type })` internal fn (pair-uniqueness check, self-link
  check) — the two validators differ only in whether `fromId` is the actor's own profile.

## Acceptance

- `wc -l src/routes/_authed/_community/members/$id/index.tsx` < 250.
- `grep -rn "RelationshipFormModal\|AddRelationSheet\|DeleteRelationDialog" src` = 0.
- Adding A→B then B→A is rejected on both surfaces with the same message.

## Comments

Implemented. `components/relations/`: `RelationsTable` (direction picks counterpart; owns delete
`ConfirmDialog`, outgoing only) + `RelationForm` (owns `FormDrawer`; picker = active profiles minus
subject + `excludeIds` = existing counterparts both directions). Hooks in `queries/communityRelation`:
`useAddMyRelation`/`useDeleteMyRelation` (invalidate list + dashboard counts),
`useAddRelationToProfile(id)`/`useDeleteRelationFromProfile(id)` (`router.invalidate`).

Server: `insertRelation` (self-link, active in-org target, pair uniqueness) +
`deleteOutgoingRelation`; `assertManageableSubject` for admin fns. Fix: self add didn't check
target org (cross-tenant link possible). `getMyCommunityRelationships` → `{ profileId, outgoing,
incoming }`; /profile/relationships now shows incoming too. Dead `getCommunityProfileList` removed.

`members/$id/index.tsx` 803 → 131 lines (`-components/MemberActions`, `MemberRelations`).

Verified in browser (local): self picker, admin add, stale self add B→A → "Relationship already
exists between these profiles" (drawer stays open), incoming row shown, admin delete via confirm.
tsc (pre-existing `CommunityNav` only), lint, format, 111 tests.
