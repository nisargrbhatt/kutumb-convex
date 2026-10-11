Label: wayfinder:map

# Userless Profile review workflow and audit log

## Destination

A spec at `.scratch/profile-lifecycle/spec.md` plus sliced implementation tickets at
`.scratch/profile-lifecycle/issues/` for: Change Requests on Userless Profiles (create, info,
relation, address) reviewed by owner/admin, and an Audit Event log of every Community Profile
change, visible to owner/admin.

## Notes

- Domain: `GLOSSARY.md` terms **Community Profile**, **Userless Profile**, **Change Request**,
  **Review**, **Audit Event**, **Relation**, **Actor**, **Member limit**. Relation direction per
  ADR 0001. Limits per ADR 0003.
- Skills to consult: `grilling` + `domain-modeling` (default), `codebase-design`,
  `tanstack-start-best-practices`, `tanstack-query-best-practices`, `better-auth-best-practices`.
- Existing code: create → `draft` → approve/reject already in `src/server/communityProfile.ts`
  (`addMissingMember`, `acceptCommunityProfile`, `rejectCommunityProfile`); admin edits userless
  relations directly (`src/server/communityRelation.ts`); no edit path for userless info/address;
  permissions in `src/domain/permission.ts`.
- Settled at charting (2026-10-10):
  - One concept: every member change to a Userless Profile is a Change Request, one queue. Create
    still materialises a `draft` row.
  - One Change Request = one thing: create, or one info patch, one relation add/remove, one address
    add/edit/remove.
  - While `draft`, creator + owner/admin edit it freely; the whole draft is judged at the create
    Review.
  - Owner/admin changes apply directly, audited as auto-approved. Admin may approve own request.
  - Reject requires a reason; approve note optional. Rejected create → hard-delete (audit keeps
    snapshot), frees Member-limit slot. `inactive` keeps meaning "deactivated".
  - Linked profiles never get Change Requests; only their user edits them.
  - Relation requests: outgoing relations of the userless profile only.
  - Custom Field Values are part of the info patch.
  - Many pending requests per profile allowed. Info patch stores field-level patch + base values;
    approval blocked as stale if a patched field changed since submission.
  - Submitter may withdraw. Reassign/delete auto-closes pending requests as superseded.
  - Visibility: `draft` profiles → creator + owner/admin only. Pending requests → submitter +
    owner/admin. Everyone else sees active, approved state.
  - Audit: every Community Profile change (linked or userless, self-edits, reassign, delete,
    relations, addresses, reviews). Kept forever, survives profile delete, dies with org. No
    backfill; history starts at deploy.
  - UI: "Reviews" page (DataTable + diff drawer + reject-reason dialog), pending badge for
    owner/admin, "My requests" for members; "History" tab on member detail + org-wide audit
    DataTable, owner/admin only.
  - Permissions: new statements `changeRequest: ["create","review"]`, `auditEvent: ["read"]`; retire
    `communityProfile.approve/reject/manageRelations`.
  - Migration backfills a pending create request for every existing `draft` profile; existing
    `inactive` untouched.
  - In-app notification only.

## Decisions so far

<!-- one line per closed ticket -->

- [D1 batch atomicity via Drizzle](issues/01-d1-batch-atomicity.md): `db.batch` = one transaction
  with rollback; no interactive tx. Guards go in-batch via `WHERE`; 0-row guard must be forced into
  an error (`changes()` + `json('stale')` trick recommended). Text JSON payload columns. Remote
  smoke test still owed.
- [Audit Event taxonomy](issues/02-audit-event-taxonomy.md): 17 dotted actions; approve = request
  event + applied event; direct edits unlinked; diff for updates, snapshots otherwise; Actor +
  profile + counterpart snapshotted, no FKs; cascades emit per-relation events; History/org-log
  filters set.
- [Change Request and Audit Event data model](issues/03-change-request-and-audit-data-model.md):
  `changeRequest` + `auditEvent` tables, org FK only, snapshots; `version` col on profile/address
  for stale check; payload per kind; relation/address stale rules; create withdraw hard-deletes;
  requests only on `active`; indexes; one migration + backfill.
- [Profile mutation seam](issues/04-profile-mutation-seam.md): `makeProfileChanges` deep module;
  `submit` (7 kinds, routes direct vs request) + `review` / `withdraw` + 4 lifecycle ops; routing +
  permission inside; `expectedVersion` on edits; `Stale`/`Conflict`/`Invalid` errors; owner/admin
  create → `active`; tests via `freshDb` + batch callback.
- [Read-side visibility of drafts and pending changes](issues/05-read-side-visibility.md): one
  Actor-aware predicate on all D1 reads; plain member sees active + own-created drafts + own
  profile, `inactive` hidden; non-visible → NotFound; counterparts filtered; tree/picker/cache stay
  active-only org-wide; pending banner on detail only; MCP tightened to active-only.
- [Review and audit UI prototype](issues/06-review-and-audit-ui-prototype.md): Reviews grouped by
  profile + stacked drawer w/ overlap warning; whole-info suggest drawer + own My requests page with
  unseen-outcome nav badge (`submitterSeenAt`); History/audit grouped by Change Request; Reviews, My
  requests, Audit log all in Community nav.
- [Assemble spec and implementation slices](issues/07-assemble-spec-and-slices.md):
  [spec.md](spec.md) + slices 08–16 (all AFK); badges via `changeRequestKeys`, 60s stale + focus, no
  polling; audit paged by group; client-side PostHog events; remote-D1 smoke test first; ADR 0005
  for audit retention/PII.
- [Remote-D1 guard smoke test](issues/08-remote-d1-guard-smoke-test.md): remote D1 confirms (a)
  `changes()`+`json('stale')` (chosen), (b), (d) roll back whole batch; `changes()` = last DML;
  batch = 1 API request toward 1000 cap; raw `sql` w/ params breaks in `db.batch`, use builders.

## Not yet specified

<!-- empty: way is clear; see spec.md -->

## Out of scope

- Email notifications for submit/Review outcome.
- Change Requests on profiles linked to an Org Member.
- MCP access to Change Requests or Audit Events; MCP stays read-only over active profiles.
- Audit backfill of history before deploy.
- Erasure of a deleted profile's personal data from Audit Event snapshots (accepted trade-off in
  [Audit Event taxonomy](issues/02-audit-event-taxonomy.md)).
