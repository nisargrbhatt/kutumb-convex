# Spec: Userless Profile review workflow and audit log

Status: ready for implementation (2026-10-10). Map: [map.md](map.md). Slices: `issues/08`–`16`.

## Problem

Members can create Userless Profiles (relatives without accounts), but after the create
accept/reject nothing governs later changes: admins edit relations directly, nobody can edit a
Userless Profile's info or addresses, plain members can't propose fixes at all, and no record exists
of who changed what. Drafts and `inactive` profiles are also visible to every member.

## Solution

Every member change to a Userless Profile becomes a **Change Request** in one owner/admin
**Review** queue. Owner/admin changes apply directly. Every Community Profile change (linked or
userless, direct or reviewed) writes an **Audit Event**, atomically with the change, kept forever.
Owner/admin get a Reviews page, an org-wide Audit log and a History tab per profile. Members get
"Suggest" drawers and a My requests page. Reads hide drafts and `inactive` profiles from members who
shouldn't see them.

Terms (`GLOSSARY.md`): **Community Profile**, **Userless Profile**, **Change Request**, **Review**,
**Audit Event**, **Relation** (direction per ADR 0001), **Actor**, **Member limit** (ADR 0003).
ADR 0005 records audit retention / PII.

## User stories

**Plain member**

- Create a Userless Profile → it's a `draft` awaiting review; I (and owner/admin) can edit it freely
  until reviewed; I can withdraw it (deleted, slot freed).
- On an `active` Userless Profile: suggest an info edit (incl. Custom Field Values), an outgoing
  relation add/remove, an address add/edit/remove. Each is one Change Request.
- See "Your change is pending" on that profile; see all my requests, their outcome, reason/note
  and reviewer on My requests; badge when something was resolved since I last looked.
- Withdraw a pending request.
- Edit my own linked profile directly (still audited).
- Never see others' drafts, `inactive` profiles, or others' pending requests.

**Owner/admin**

- Reviews page: profiles with pending requests, oldest first; drawer with each request's
  before/after diff, stale reason, overlap warning; approve (optional note) or reject (required
  reason). Nav badge with pending count.
- Edit any Userless Profile directly (info, relations, addresses); deactivate / reactivate;
  owner deletes. Pending requests are superseded on reassign/deactivate/delete.
- History tab on member detail; org-wide Audit log with filters.

## Implementation decisions

### Atomicity (D1)

[D1 batch atomicity via Drizzle](issues/01-d1-batch-atomicity.md): `db.batch` = one transaction.
Race-free guards live in `WHERE` (`id=? AND version=?`, `status='pending'`), followed by
`SELECT CASE WHEN changes()=1 THEN 1 ELSE json('stale') END` to turn a 0-row guard into an error
that rolls the batch back. Confirmed on remote D1 by
[slice 08](issues/08-remote-d1-guard-smoke-test.md); CHECK guard table / trigger also work. The
guard must come right after its guarded DML (`changes()` = last INSERT/UPDATE/DELETE). Batch DML
via Drizzle builders; raw `db.run(sql\`…${param}\`)` inside `db.batch` throws (drizzle 0.45.2).

### Schema

Per [data model](issues/03-change-request-and-audit-data-model.md), plus `submitterSeenAt`:

- `communityProfile.version`, `communityAddress.version`: int default 0, bumped on every write.
- `changeRequest`: `id, organizationId (FK cascade), profileId, profileName, kind, status,
  targetId?, payload json, submitterUserId?, submitterName, createdAt, resolvedByUserId?,
  resolvedByName?, resolvedAt?, resolutionNote?, submitterSeenAt?`. No profile/user FKs.
- `auditEvent`: `id, organizationId (FK cascade), action, createdAt, actorUserId, actorName,
  actorRole, profileId, profileName, counterpartProfileId?, counterpartName?, targetId?,
  changeRequestId?, payload json`. No other FKs.
- Enums in `src/db/constants.ts`: `CHANGE_REQUEST_KIND` (`create | info | relation_add |
  relation_remove | address_add | address_edit | address_remove`), `CHANGE_REQUEST_STATUS`
  (`pending | approved | rejected | withdrawn | superseded`), `AUDIT_ACTION` (17 dotted names per
  [taxonomy](issues/02-audit-event-taxonomy.md)).
- Indexes: per data model ticket.
- One migration; hand-appended `INSERT … SELECT` backfills a pending `create` request (null
  submitter, "Unknown") per existing `draft`; no audit backfill.

### Permissions

`changeRequest: ["create", "review"]` (member: create; admin/owner: create + review),
`auditEvent: ["read"]` (admin/owner). Retire `communityProfile.approve / reject / manageRelations`
and the glossary-less "Manage Relations" UI copy. Keep `communityProfile.create / delete /
reassign`.

### Mutation seam

[Profile mutation seam](issues/04-profile-mutation-seam.md): `makeProfileChanges({ db, limits,
onGraphChanged })` in `src/domain/profileChanges.ts`, wired in `src/lib/profileChanges.ts`.

- `submit(actor, change)` → `applied | requested(changeRequestId) | unchanged`. Routing inside:
  linked → only its user, direct; userless `draft` → creator or owner/admin direct, else NotFound;
  userless `active` → owner/admin direct, member request; `inactive` → owner/admin direct.
  Owner/admin create → `active` + `profile.created`; member create → `draft` + pending create
  request + `change_request.submitted`.
- `review(actor, id, { decision, note })`, `withdraw(actor, id)`.
- Lifecycle: `reassign`, `deactivate`, `reactivate`, `remove` (owner). Reassign/deactivate/remove
  supersede pending requests in the same batch.
- Info + address_edit carry `expectedVersion`; mismatch → `Stale`. Empty diff → `unchanged`.
- Stale rules: info/address_edit patched field ≠ base or target gone; relation_add counterpart not
  `active` or pair related either way; relation/address remove target gone; address_add never.
- Errors: `Stale`, `Conflict`, `Invalid` added to `AppErrorKind`.
- Member-limit check before batch (race accepted). `onGraphChanged` after commit only when
  graph-held data of an `active` profile changed: any info field (name, nickname, gender, dates,
  contact, blood group — not Custom Fields), a relation add/remove, or a status change that moves a
  profile in/out of the graph (create-active, draft activation, deactivate/reactivate, delete of an
  active profile). Address and Custom Field changes, and requests, never fire it.
- Server fns: one thin fn per kind taking `profileId`; "My…" / "…ToProfile" pairs collapse.

### Audit emission

Per [taxonomy](issues/02-audit-event-taxonomy.md): approve = `change_request.approved` + applied
event (Actor = reviewer, `changeRequestId` set); reject create = `rejected` + `profile.deleted`;
withdraw create = `withdrawn` + `profile.deleted`; direct/draft edits = change event only;
delete = full snapshot + `relation.removed` per cascaded relation. `*.updated` payload
`{ field: [before, after] }`; create/delete/add/remove = snapshots.

### Read-side visibility

[Read-side visibility](issues/05-read-side-visibility.md): one Actor-aware predicate in
`src/domain/queries/profiles.ts`; plain member sees `active` + own-created drafts + own linked
profile; non-visible → NotFound; counterparts filtered silently. Tree, graph, picker, lite search,
KV cache stay active-only org-wide. Members list status filter for plain members = All + Draft.
Pending banner on detail only. MCP: `search_profiles` drops `status` (active only), `get_profile`
NotFound for non-active except caller's own, counterparts active-only.

### UI

[Review and audit UI prototype](issues/06-review-and-audit-ui-prototype.md) (branch
`prototype/review-audit-ui`, reference only):

- **Community nav**: Reviews (owner/admin, pending badge), My requests (all, unseen badge), Audit
  log (owner/admin).
- **Reviews** `/reviews`: DataTable grouped by profile (profile, count, stale, kinds, oldest age);
  right drawer stacks the profile's requests with diff, stale reason, overlap warning, optional
  approve note, reject → reason dialog ("draft will be deleted" for create).
- **Suggest** drawers on active Userless Profile detail: whole info form, address, relation.
  Toast + pending banner.
- **My requests** `/my-requests`: DataTable (kind, profile, status, outcome, submitted); drawer
  with outcome + diff; Withdraw → confirm dialog. Visiting marks resolved requests seen.
- **History**: one component for member detail tab and `/audit-log`; rows grouped by Change Request
  (summary, How badge: pending / approved / rejected / withdrawn / superseded / direct / self-edit,
  when), expandable to per-event rows with Actor, role, diff. Org log filters: action by category,
  Actor, profile, date range. History tab: category filter.
- **Lifecycle actions**: member detail "⋯" menu (owner/admin): Deactivate / Reactivate, Delete
  (owner). Confirm dialogs warn "N pending requests will be superseded".
- Owner/admin edit drawers on Userless Profile detail for info + addresses (relations exist).
- Every page: breadcrumbs, responsive, react-hook-form + zod, right drawers for create/edit,
  dialogs for confirms.

### Query keys + badges

Add to `src/queries/keys.ts`:

```ts
changeRequestKeys = {
  all(orgId), queue(orgId), pendingCount(orgId), mine(orgId),
  unseenCount(orgId), forProfile(orgId, profileId),
}
auditKeys = { all(orgId), log(orgId, filter), profile(orgId, profileId, filter) }
```

Badges load in the Community layout, `staleTime` 60 s, refetch on window focus, no polling. Every
profile / relation / address / review / withdraw mutation invalidates `changeRequestKeys.all`,
`profileKeys.all` and `auditKeys.all`. My requests page calls `markRequestsSeen` (sets
`submitterSeenAt` on the viewer's resolved requests) then invalidates `unseenCount`.

### Audit pagination

Paged by **group**, server-side. Group key `coalesce(changeRequestId, id)`; order by group's latest
event `(latestAt desc, groupKey desc)`; 25 groups/page; cursor = last `(latestAt, groupKey)`;
response carries every event of each group. A filter matches a group if any of its events matches
(History: subject or counterpart = profile).

### Analytics

Client-side `posthog.capture` in `src/queries/*` mutation `onSuccess`, never field values or names:
`change_request_submitted {kind}`, `change_request_reviewed {kind, decision}`,
`change_request_withdrawn {kind}`, `profile_deactivated`, `profile_reactivated`, `profile_deleted`;
`profile_saved` / `member_added` gain `{ outcome: "applied" | "requested" }`. Retire
`member_profile_accepted` / `member_profile_rejected`. Stale-blocked approve:
`change_request_reviewed {kind, decision: "approve", stale_blocked: true}` on the `Stale` error.

## Testing

- Seam: only through `makeProfileChanges`, `freshDb` + batch callback (BEGIN/COMMIT/ROLLBACK), fake
  limits, spy `onGraphChanged`. Cover every routing cell, every stale rule, guard trip → `Conflict`,
  rollback leaves no partial rows, events per emission rule.
- Read predicate: `src/domain/queries/*.test.ts` per role × status.
- Audit pagination: group spanning many events, interleaved groups, filters.
- Migration backfill: draft → one pending create request.
- MCP tools: active-only tests updated.
- UI: browser-verified via dev preview per slice.

## Out of scope

Email notifications; Change Requests on linked profiles; MCP access to requests/events; audit
backfill; erasure of audit snapshots (ADR 0005).

## Slices

{[08 smoke test](issues/08-remote-d1-guard-smoke-test.md),
[09 schema](issues/09-schema-migration-permissions.md)} →
{[10 seam direct-apply](issues/10-mutation-seam-direct-apply.md) (08, 09),
[12 visibility](issues/12-read-side-visibility.md) (09)} →
{[11 create on queue](issues/11-create-flow-on-queue.md) (10),
[16 history + audit log](issues/16-history-and-audit-log.md) (10)} →
[13 member requests](issues/13-member-change-requests.md) (11) →
{[14 Reviews page](issues/14-reviews-page.md) (11, 13),
[15 member side](issues/15-member-suggest-and-my-requests.md) (12, 13)}.
