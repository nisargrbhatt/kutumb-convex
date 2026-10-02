# get_family_graph tool

Type: AFK Status: done Blocked by: 13

Spec: [spec.md § Tools](../spec.md)

## What to build

`get_family_graph({ focusId?, depth? = 2 ≤3 })` on KV graph blob via `extractSubgraph`. Output
`{ nodes, edges: [{fromId,toId,type}], truncated }`, cap 200 nodes. Default focus = caller's profile
(else error asking for focusId). Description states "`to` is `from`'s `<type>`".

## Acceptance criteria

- [x] depth clamp, 200-node cap, `truncated` tested
- [x] node shape matches search item (id, fullName, gender, status)
- [ ] works via Inspector on a seeded org (not run: slice 17; covered by handler-level tests on
      migrated sqlite)

## Resolution

- `src/server/mcp/tools/getFamilyGraph.ts`: zod in/out + description +
  `getFamilyGraph(db, actor, input)`; registered in `server.ts`. Reuses `getOrgGraphBlob` +
  `extractSubgraph` (BFS, nearest-first).
- `depth` default 2, any int clamped 1..3 (not rejected). Cap 200 nodes nearest-first (focus first);
  edges filtered to kept nodes; `truncated` = more than 200 matched.
- Focus: `focusId` → else caller's own profile in org → else `NotFound` isError asking for
  `focusId`. Focus not in blob (unknown / cross-org / inactive) → `NotFound`.
- Node = search item (`id, fullName, nickName, gender, status`). Edges `{fromId,toId,type}` straight
  from stored rows, never inverted; description states "`to` is `from`'s `<type>`" + worked example.
- **Deviation from spec**: blob holds active profiles only, so inactive never appear (spec said "any
  status"). `status` is always `active`. Follows issue ("on KV graph blob"); get_profile covers any
  status.
- Tests: `tools/familyGraph.test.ts` (real handler, migrated sqlite, fake KV): own-profile default,
  shape/direction, depth default+clamp, 200 cap/truncated/exact-200, no-profile error, NotFound
  cases, inactive hidden, description. `cloudflare:workers` mocked in
  `server.test`/`profileTools.test`.
- Not run: real client / Inspector (slice 17).
