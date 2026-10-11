# Read-side visibility

Type: AFK Status: resolved Blocked by: 09

Spec: [spec.md § Read-side visibility](../spec.md)

## What to build

Per [Read-side visibility](05-read-side-visibility.md):

- One Actor-aware visibility predicate in `src/domain/queries/profiles.ts`; owner/admin all;
  plain member `active` + drafts they created (submitter of pending create request) + own linked
  profile. Applied to members list, detail (subject → NotFound), outgoing/incoming relations +
  My relationships + dashboard relation counts (counterparts filtered silently).
- Members list status filter for plain members: All + Draft; owner/admin unchanged.
- Tree / graph / picker / lite search / KV cache / counts: untouched (assert active-only).
- MCP: `search_profiles` drops `status` input; `get_profile` NotFound for non-active except
  caller's own; counterparts active-only; descriptions updated.

## Acceptance criteria

- [x] query tests per role × status (draft own/other/backfilled, inactive, own inactive linked)
- [x] MCP tool tests updated; cross-role NotFound
- [x] browser: plain member can't open another's draft or inactive profile by URL

## Comments

- `visibleProfileWhere(actor)` in `src/domain/queries/profiles.ts`; list, detail, My
  relationships (`getMyRelationships`), dashboard counts (`countMyRelations`) use it. Counterparts
  filtered via join (`relationsWithVisibleCounterpart`), no `IN` list (D1 100-param cap).
- MCP: `getCommunityProfileDetail(..., { audience: "aiClient" })` = active + own subject, active
  counterparts. `searchProfilesInput.status` removed.
- UI: `memberStatusFilterOptions(actor)` drives members status Select.
- Graph blob active-only asserted (draft + inactive, all roles) in familyGraph.test.ts. Picker
  (`getActiveProfilesForRelation`) unchanged, no test (server fn on `@/db`).
- Browser check not done: worktree has no local D1/seed; needs multi-user + role setup. NotFound
  by URL covered by query test only.
- Browser item verified in ticket 15 comment (other's draft / inactive by URL → 404, SSR + client nav).
