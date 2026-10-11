# Audit Event taxonomy

Type: grilling Status: resolved Blocked by:

## Question

What exactly does an Audit Event record? Settle:

- The action list (e.g. profile created/updated/deleted/reassigned/activated/deactivated, relation
  added/removed, address added/updated/removed, Change Request submitted/approved/rejected/
  withdrawn/superseded, direct owner/admin edit) — names go in `src/db/constants.ts`.
- Payload per action: full before/after snapshot vs diff; whether the Actor's name/role is
  snapshotted at the time (actor may leave the org).
- Subject keys: profile id always; relation/address ids; Change Request id; how events stay readable
  after the profile is hard-deleted (display name snapshot?).
- Is a Review one event or does it emit both "request approved" and the applied change event?
- Which reads the History tab vs org-wide log need (filters → indexes).

## Answer

Resolved 2026-10-10 (grilling).

**Actions** (`AUDIT_ACTION` in `src/db/constants.ts`, dotted names):

- `profile.created`, `profile.updated`, `profile.activated` (create approved),
  `profile.deactivated`, `profile.reactivated`, `profile.reassigned`, `profile.deleted`
- `relation.added`, `relation.removed` (no relation edit)
- `address.added`, `address.updated`, `address.removed`
- `change_request.submitted`, `.approved`, `.rejected`, `.withdrawn`, `.superseded`

**Emission rules**

- Approve → two events, one batch: `change_request.approved` (note) + applied change event, Actor =
  reviewer, carrying `changeRequestId` (proposer reachable via it).
- Reject create → `change_request.rejected` (reason) + `profile.deleted` (hard-delete).
- Owner/admin direct edit → change event only, `changeRequestId = null`; no stub request.
  "Auto-approved" = no request link + owner/admin Actor role.
- Draft edits (creator, owner/admin) → plain change events, no request link.
- Profile delete → `profile.deleted` (full snapshot incl. addresses + Custom Field Values) + one
  `relation.removed` per cascaded relation, either direction; no `address.removed`.
- Reassign/delete → `change_request.superseded` per pending request, Actor = reassigner/deleter.
- Reassign keeps `draft` status; only the create Review changes status.
- No-op save (empty diff) → no event.
- Backfilled create requests get no `submitted` event; history shows only the Review.

**Payload**

- `*.updated` → changed fields only, `{ field: [before, after] }`.
- `*.created` / `*.deleted` / relation + address add/remove → full snapshot.
- Custom Field Values keyed by definition id + label snapshot.
- `change_request.submitted` → kind + proposed patch/snapshot (self-contained); `rejected` → reason;
  `approved` → note; `withdrawn` / `superseded` → kind.
- `profile.reassigned` → target user id + name + email snapshot.

**Subject / Actor columns** (no FKs except org, cascade with org)

- Actor: user id + name + role at time.
- Subject: profile id + display name at time.
- Relation events: counterpart profile id + display name too, so both profiles' History shows it.

**Reads**

- History tab: events where profile is subject or counterpart, newest first, paginated; filter by
  category (profile / relation / address / request).
- Org-wide log: filter by action (grouped by category), Actor, profile (subject or counterpart),
  date range; time desc only, cursor pagination.

**Accepted trade-off**: deleted profile's PII stays in audit snapshots forever (owner/admin
visible). Erasure is out of scope.
