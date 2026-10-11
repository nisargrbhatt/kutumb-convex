# Change Request and Audit Event data model

Type: grilling Status: resolved Blocked by: 01, 02

## Question

Design the D1/Drizzle tables for Change Requests and Audit Events. Settle:

- Change Request columns: kind (create / info / relation-add / relation-remove / address-add /
  address-edit / address-remove), status (pending / approved / rejected / withdrawn / superseded),
  submitter, reviewer, reason/note, timestamps, profile id, payload JSON.
- Payload shape per kind, including base values for stale detection (info patch) and how
  relation/address requests detect staleness.
- Status/kind enums in `src/db/constants.ts`.
- FK behaviour: Change Request on profile delete (cascade vs superseded-then-kept); Audit Event has
  no profile FK, cascades with org only.
- Indexes for the Reviews queue, My requests, History tab, org-wide log.
- How the atomic apply is expressed given the findings of
  [D1 batch atomicity via Drizzle](01-d1-batch-atomicity.md).
- Migration: new tables + backfill of pending create requests for existing `draft` profiles.

## Answer

Resolved 2026-10-10 (grilling).

**Profile/address changes**

- New `version` int (default 0) on `communityProfile` + `communityAddress`, bumped by every write
  (drafts, self-edits, admin edits, approvals).

**`changeRequest` table** (FK to org only, cascade; no profile/user FKs, snapshots instead)

- `id`, `organizationId`, `profileId`, `profileName` (snapshot), `kind`, `status`, `targetId`
  (relation/address id, nullable), `payload` (`text({mode:"json"})`), `submitterUserId` (nullable),
  `submitterName`, `createdAt`, `resolvedByUserId`, `resolvedByName`, `resolvedAt`, `resolutionNote`
  (reject reason / approve note; null for withdrawn/superseded).
- Survives profile hard-delete so "My requests" still shows the outcome + reason.
- Timestamps `integer timestamp_ms`.

**`auditEvent` table** (FK to org only, cascade)

- `id`, `organizationId`, `action`, `createdAt`, `actorUserId`, `actorName`, `actorRole`,
  `profileId`, `profileName`, `counterpartProfileId`, `counterpartName`, `targetId`,
  `changeRequestId` (no FK), `payload` (json).

**Enums** (`src/db/constants.ts`)

- `CHANGE_REQUEST_KIND`:
  `create | info | relation_add | relation_remove | address_add | address_edit | address_remove`.
- `CHANGE_REQUEST_STATUS`: `pending | approved | rejected | withdrawn | superseded`.
- `AUDIT_ACTION`: dotted names per [Audit Event taxonomy](02-audit-event-taxonomy.md).

**Payload per kind**

- `create`: `null` (draft row is what's judged).
- `info`: `{ field: [base, proposed] }`; Custom Field Values keyed by definition id + label
  snapshot. Same format as the `profile.updated` diff, copied into the audit event on approve.
- `relation_add`: `{ toId, toName, type, note, bloodRelation }`.
- `relation_remove`: `targetId` + relation snapshot.
- `address_add`: full address. `address_edit`: `targetId` + `{ field: [base, proposed] }`.
  `address_remove`: `targetId` + snapshot.

**Stale rules** (approve blocked; stale request can only be rejected or withdrawn, never
auto-closed)

- `info` / `address_edit`: a patched field's current value ≠ base, or address gone.
- `relation_add`: counterpart not `active`, or pair already related in either direction.
- `relation_remove` / `address_remove`: target gone. `address_add`: never stale.
- Mechanism: read row + `version`, compare patched fields in app; then batch with
  `WHERE version=?` + `changes()` guard. Guard failure = changed mid-Review → re-read to classify
  (stale vs already closed) and surface as domain error.

**Atomic apply** (one `db.batch`, technique (a) from
[D1 batch atomicity via Drizzle](01-d1-batch-atomicity.md)), e.g. approve info:

1. `UPDATE changeRequest SET status='approved',… WHERE id=? AND status='pending'` + guard
2. `UPDATE communityProfile SET …, version=version+1 WHERE id=? AND version=?` + guard
3. `INSERT auditEvent change_request.approved` + `INSERT auditEvent profile.updated`

**Scope rules surfaced**

- Non-create requests only on `active` Userless Profiles; `draft` edited directly by creator +
  owner/admin; `inactive` owner/admin only.
- Draft creator = submitter of its pending create request (no profile column). Backfilled drafts
  have null submitter ("Unknown") → visible to owner/admin only.
- Withdraw create → hard-delete draft (`change_request.withdrawn` + `profile.deleted`), frees
  Member-limit slot.
- Submitter leaving org: their pending requests stay pending.

**Indexes**

- `changeRequest(organizationId, status, createdAt)`: Reviews queue + badge count
- `changeRequest(organizationId, submitterUserId, createdAt)`: My requests
- `changeRequest(profileId, status)`: supersede on reassign/delete, pending markers
- `auditEvent(organizationId, createdAt)`: org log
- `auditEvent(organizationId, profileId, createdAt)` +
  `(organizationId, counterpartProfileId, createdAt)`: History tab (OR)
- `auditEvent(organizationId, actorUserId, createdAt)`: Actor filter
- Action/category filter via `action IN (...)`; cursor `(createdAt, id)`.

**Migration**: one drizzle-kit migration (2 tables + `version` columns) with hand-appended
`INSERT … SELECT` backfilling a pending `create` request per `draft` profile (null submitter, no
`submitted` event).
