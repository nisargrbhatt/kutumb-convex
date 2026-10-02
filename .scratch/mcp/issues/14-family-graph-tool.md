# get_family_graph tool

Type: AFK
Status: open
Blocked by: 13

Spec: [spec.md § Tools](../spec.md)

## What to build

`get_family_graph({ focusId?, depth? = 2 ≤3 })` on KV graph blob via `extractSubgraph`. Output
`{ nodes, edges: [{fromId,toId,type}], truncated }`, cap 200 nodes. Default focus = caller's profile
(else error asking for focusId). Description states "`to` is `from`'s `<type>`".

## Acceptance criteria

- [ ] depth clamp, 200-node cap, `truncated` tested
- [ ] node shape matches search item (id, fullName, gender, status)
- [ ] works via Inspector on a seeded org
