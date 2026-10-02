# Profile tools: search_profiles + get_profile

Type: AFK Status: done Blocked by: 12

Spec: [spec.md § Tools](../spec.md)

## What to build

Extract `(actor, input)` query fns into `src/domain/queries/*`; existing server fns call them.
Tools `search_profiles` (status default active, gender, limit 25/≤100, cursor) and `get_profile`
(all cols minus org id, addresses, labelled custom fields, subject-centric `outgoing`/`incoming`
with counterpart gender). zod `outputSchema` + JSON text fallback; descriptions carry ADR 0001
worked example.

## Acceptance criteria

- [x] existing members/profile pages unchanged behaviour (server fns use extracted fns)
- [x] field parity with in-app view for the Actor's role
- [x] relation lists never inverted; tests incl. sisters example
- [x] paging/limit/status tests; cross-org id → NotFound `isError`

## Resolution

- `src/domain/queries/{db,profiles}.ts`: `(db, actor, input)` fns, db injected (no `cloudflare:workers`,
  testable on node:sqlite). `listCommunityMembers` + `getCommunityProfileDetail` = moved verbatim
  from `getCommunityMembers` / `getCommunityMemberById` (server fns now one-line callers; detail
  counterparts also carry `gender`/`status`). `searchProfiles` new: status default `active`,
  gender, limit default 25 clamp 1..100, keyset cursor = last id (order by id), `limit+1` fetch.
- `query` = whitespace tokens, all must match first/middle/last/nick (LIKE, `%_\` escaped), so
  "jared smith" works. Members page search unchanged (first/last/email).
- Tools: `tools/{searchProfiles,getProfile}.ts` (zod output + description), `defineReadTool` now
  takes optional `inputSchema` (SDK validates; `run(actor, input)`). `search_profiles` input zod in
  `domain/communityProfile.ts`.
- `get_profile`: all columns minus `organizationId` and raw `customFieldData` (replaced by
  `customFields` `[{id,label,type,value}]`, unset values + orphans omitted); `userId` kept (in-app
  returns it). Relations `{type, counterpart{id,fullName,gender,status}}`, never inverted. No
  role-gated fields exist in-app today, so parity is role-independent.
- Tests: `domain/queries/profiles.test.ts` (org scope, status/gender, token search, paging, clamp,
  NotFound cross-org), `tools/profileTools.test.ts` (through real MCP handler on migrated sqlite:
  sisters example both directions, parity, any-status, text fallback, cross-org `isError`, limit
  >100 rejected). `src/test/sqliteDb.ts` = shared migrated-sqlite helper (`actor.test` uses it).
- Not run: real client / live dev (slice 17); members pages not eyeballed in browser (server fns are
  pass-through to moved code).
