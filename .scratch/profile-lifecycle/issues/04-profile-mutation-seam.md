# Profile mutation seam

Type: grilling
Status: resolved
Blocked by: 01, 03

## Question

Every Community Profile write must (a) decide direct-apply vs Change Request by Actor role and
profile linkage, and (b) write its Audit Event atomically. Design the deep module that owns this
(per `codebase-design`):

- Its interface: one entry per change kind taking `(actor, input)`? A single `propose/apply`
  pair?
- How the existing server fns in `src/server/communityProfile.ts`, `communityRelation.ts`,
  `communityAddress.ts` route through it (self-edits, admin direct edits, reassign, delete,
  approve/reject, withdraw, supersede).
- Where permission checks (`assertCan`), Member-limit checks, and graph cache invalidation
  (`invalidateOrgGraph`) live relative to it.
- Test strategy: domain tests against the module without HTTP.

## Answer

Resolved 2026-10-10 (grilling).

**Module**: `makeProfileChanges({ db, limits, onGraphChanged })` in `src/domain/profileChanges.ts`,
wired in `src/lib/profileChanges.ts` (mirrors `makeLimits`). Free of `cloudflare:workers` / KV.
`db` typed as a narrow `BatchDb` (D1 client + `freshDb` both satisfy); read-only query fns keep
`QueryDb`.

**Interface**

- `submit(actor, change)`: `change` = union of the 7 Change Request kinds (`create`, `info`,
  `relation_add`, `relation_remove`, `address_add`, `address_edit`, `address_remove`). Returns
  `{ outcome: "applied" } | { outcome: "requested", changeRequestId } | { outcome: "unchanged" }`.
  Caller never chooses direct vs request.
- `review(actor, requestId, { decision, note })`, `withdraw(actor, requestId)`.
- Lifecycle (owner/admin, never requests): `reassign` (active Userless Profiles only; draft →
  `Invalid` "review it first"), `deactivate`, `reactivate` (no limit check), `remove`
  (owner-only, `communityProfile.delete`). Deactivate + remove supersede pending requests in the
  same batch.
- One private planner turns a change into batch statements + Audit Events; shared by direct apply
  and approve.

**Routing (inside the module; server fns no longer call `assertCan` for these)**

- Linked profile: only its user, direct; anyone else `Forbidden`. Self-create/self-edit go through
  `submit`; self-save no longer forces `status: active`.
- Userless `draft`: creator or owner/admin, direct (plain events); others `NotFound`.
- Userless `active`: owner/admin direct; member → Change Request.
- Userless `inactive`: owner/admin only, direct.
- Create: owner/admin → `active` at once, `profile.created`, no request; member → `draft` + pending
  create request.

**Permissions**: direct apply on Userless ⇔ `changeRequest.review`; member submit ⇔
`changeRequest.create`. Retire `communityProfile.manageRelations` (and glossary term "Manage
Relations") plus `approve` / `reject`.

**Concurrency**: info + address_edit submits carry `expectedVersion` (version when form loaded);
mismatch → `Stale` ("reload"), direct and request alike; diff computed against that version. Empty
diff → `unchanged`, no event, no request.

**Errors**: `AppErrorKind` += `Stale` (approve blocked / version mismatch), `Conflict` (request
already closed, non-stale guard trip), `Invalid` (domain rule: self-relation, duplicate pair,
reassign draft). Existing plain `Error` throws in relation code → `Invalid`. D1 guard/constraint
failures mapped by the module.

**Side effects**: Member-limit check before the batch (race accepted, ADR 0003).
`onGraphChanged` after a successful batch only when status, name, or relations changed (not
address-only, not pending requests). Actor name for snapshots looked up by the module (Actor type
unchanged).

**Server fns**: one thin fn per kind taking `profileId` (validate → module → result); "My…" +
"…ToProfile" pairs collapse; UI gets own profile id from `getMyCommunityProfile`. Delete,
deactivate, reactivate fns and owner/admin address paths are new.

**Tests**: only through the module interface, `freshDb` + batch callback (BEGIN / COMMIT /
ROLLBACK, all-or-nothing like D1), fake limits, spy `onGraphChanged`; planner not exported.
Remote-D1 smoke test stays its own slice.
