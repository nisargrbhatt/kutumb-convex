# v1 MCP tool catalogue

Type: grilling
Status: resolved
Blocked by:

## Question

Which read-only tools does v1 expose? Candidates: search profiles, get profile, list relations,
list custom field definitions. For each, settle:
- inputs and output shape
- which fields are exposed to an AI Client (address, contact, custom fields, draft/inactive
  profiles?)
- how relation direction is explained in tool descriptions, so the LLM answers "how many sisters
  does Jared have?" correctly per ADR 0001
- whether tools reuse the `src/server/*` domain functions via Actor

## Answer

Resolved 2026-09-26 (grilling). All read-only; annotate `readOnlyHint: true`.

**Tools (4):**
- `whoami` → `{ userId, organization: {id, name}, role, profileId | null }`. Anchors "my" questions.
- `search_profiles({ query?, status? = "active", gender?, limit? = 25 (max 100), cursor? })` →
  `{ items: [{ id, fullName, nickName, gender, status }], nextCursor | null }`. Lite rows only.
- `get_profile({ id })` → full profile (all columns except org id), `addresses`, custom field values
  **labelled** via org definitions (`[{ id, label, type, value }]`), `outgoing`, `incoming`.
- `get_family_graph({ focusId?, depth? = 2 (max 3) })` → `{ nodes, edges: [{fromId,toId,type}],
  truncated }`, cap 200 nodes. Built on existing KV graph blob (`extractSubgraph`).
- No separate custom-field-definitions tool (folded into `get_profile`). Memories: not in v1.

**Field exposure:** parity with the Actor's in-app view (email, mobile, DOB, addresses, comment,
custom fields). Connection = consent; role checked live. Revisit if field-level visibility lands.

**Status:** `search_profiles` defaults `status=active`, filterable. `get_profile` + graph return any
status; every profile carries `status`.

**Relation direction (ADR 0001):** `get_profile` emits subject-centric lists, never inverted:
- `outgoing: [{ type, counterpart: {id, fullName, gender, status} }]`: "counterpart is subject's
  `<type>`".
- `incoming: [...]` (same shape): "subject is counterpart's `<type>`".
Counterpart `gender` included so LLM can infer, e.g. incoming `brother` from female counterpart ⇒
she is subject's sister. Tool description carries worked example ("how many sisters does Jared
have?" = outgoing `sister` + incoming `brother`/`sister` whose counterpart is female). Graph
description states `from→to` rule: "`to` is `from`'s `<type>`".

**Domain reuse:** extract plain `(actor, input)` query fns (e.g. `src/domain/queries/*`) called by
both existing server fns and tools. Tools never touch `createServerFn`. Actor construction → ticket
06.

**Output:** `structuredContent` + zod `outputSchema`, plus JSON `text` block fallback. Stable ids
everywhere for chaining `search → get_profile`.

**Size limits (fog graduated):** search limit 25/max 100 + cursor; graph depth ≤3, ≤200 nodes,
`truncated` flag.
