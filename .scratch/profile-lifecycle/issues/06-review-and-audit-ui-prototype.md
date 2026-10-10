# Review and audit UI prototype

Type: prototype
Status: resolved
Blocked by: 02, 03

## Question

How should the workflow look and behave? Prototype rough, throwaway UI for:

- "Reviews" page: pending DataTable (kind, profile, submitter, age, stale flag), right drawer
  with before/after diff per kind, approve (optional note) / reject (reason dialog).
- Member side: submitting an edit on an active Userless Profile (info drawer, relation, address)
  and seeing "pending" state; "My requests" list with outcomes + reasons; withdraw.
- History tab on member detail + org-wide audit DataTable with filters.
- Pending-count badge in nav.

Must be responsive with breadcrumbs (CLAUDE.md Page Design).

## Answer

Resolved 2026-10-10 (prototype). Prototype: branch `prototype/review-audit-ui` (commit `1e7b72a`,
local, never merge), route `/prototype/review-ui?surface=…&variant=…`.

**Reviews page → variant C (grouped by profile)**

- Table, one row per profile with pending requests: profile, pending count, stale flag, kinds,
  oldest age; oldest first.
- Row → right drawer listing that profile's pending requests stacked, each with kind, submitter,
  age, stale reason, before/after diff table, its own Approve / Reject.
- Approve disabled when stale; reject → dialog with required reason (create: "draft will be
  deleted").
- Overlap warning kept: when ≥2 pending info requests patch the same field, drawer warns that
  approving one makes the other stale.
- Approve note: optional (prototype C dropped the note box; add it back per request).

**Member side → variant A (whole-info drawer + own "My requests" page)**

- Active Userless Profile detail: "Suggest edit" on Info opens right drawer with full info form
  (Custom Field Values incl.), "Submit for review"; only changed fields sent. "Suggest address" /
  "Suggest relation" same drawer pattern.
- After submit: toast + pending banner per
  [Read-side visibility](05-read-side-visibility.md), banner action → My requests.
- "My requests": own page in **Community** nav, all members. Table: kind, profile, status,
  outcome (reason/note + reviewer), submitted. Row → drawer with status, outcome alert, diff;
  Withdraw (pending only) → confirm dialog (create: "draft will be deleted").
- Outcome signal: **unseen badge** on My requests nav item = count of the viewer's requests
  resolved (approved/rejected/superseded) since last seen; cleared on visiting the page. Needs a
  nullable `submitterSeenAt` on `changeRequest` (addition to
  [data model](03-change-request-and-audit-data-model.md)). No bell.

**History → variant C (grouped by Change Request)**

- Same component for member detail "History" tab (subject or counterpart) and org-wide audit log.
- One row per logical change: events sharing `changeRequestId` collapse into one row (submitted →
  approved/rejected + applied event); unlinked events own row. Columns: summary sentence, "How"
  badge (pending / approved / rejected / withdrawn / superseded / direct / self-edit), when.
- Expand row → child rows per event: action, Actor + role, time, inline diff.
- "direct" = owner/admin edit without request (the "auto-approved" case); "self-edit" = linked
  user editing own profile.
- Org log adds filter toolbar (action grouped by category, Actor, profile, date) + cursor
  load-more; History tab gets category filter.
- Org audit log nav: **Community** group, owner/admin only, next to Reviews.

**Nav**: Community group gets Reviews (owner/admin, pending-count badge), My requests (everyone,
unseen-outcome badge), Audit log (owner/admin).

Open for spec: grouping paginates by event or by group (cursor across collapsed groups).
