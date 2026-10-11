# History tab + org audit log

Type: AFK Status: resolved Blocked by: 10

Spec: [spec.md § UI, § Audit pagination](../spec.md)

## What to build

- Query fn in `src/domain/queries/` paging audit by **group** (key `coalesce(changeRequestId, id)`,
  order `(latestAt, groupKey)` desc, 25 groups/page, cursor, all events per group). Filters: action
  category/action list, Actor, profile (subject or counterpart), date range. Gated by
  `auditEvent.read`.
- Shared History component: group row (summary sentence, How badge pending / approved / rejected /
  withdrawn / superseded / direct / self-edit, when) → expand to event rows (action, Actor + role,
  time, inline diff).
- Member detail "History" tab (owner/admin) with category filter.
- `/audit-log` route (owner/admin) with filter toolbar + load-more; Community nav item.
- `auditKeys` query options. Reference: prototype variant C.

## Acceptance criteria

- [x] query tests: group spanning days with interleaved groups stays one row, page boundaries never
      split a group, filters match group if any event matches, counterpart events appear in both
      profiles' History, deleted profile's events still listed
- [x] responsive; table → stacked on mobile
- [x] plain member: no tab, `/audit-log` redirects

## Comments

- 2026-10-11: done on `plc-16-history-audit`. Query `listAuditGroups` / `listAuditFacets`
  (`src/domain/queries/audit.ts`), presentation helpers `groupHow` / `groupSummary` / `diffRows`
  (`src/domain/audit.ts`), shared `AuditHistory` (`src/components/audit/`), History tab on member
  detail, `/audit-log` (filters in URL search, load-more), nav item. How: `self-edit` = unlinked
  member-role event (incl. own-draft edits), per prototype C. Profile/Actor filter options come from
  the log itself (deleted profiles + departed Actors stay selectable; subjects only). Browser
  verified desktop/tablet/mobile + member redirect.
