# Schema, migration and permissions

Type: AFK Status: resolved Blocked by:

Spec: [spec.md § Schema, § Permissions](../spec.md)

## What to build

- `src/db/constants.ts`: `CHANGE_REQUEST_KIND`, `CHANGE_REQUEST_STATUS`, `AUDIT_ACTION` (+ category
  grouping helper for filters: profile / relation / address / request).
- `src/db/app-schema.ts`: `changeRequest`, `auditEvent` tables (incl. `submitterSeenAt`), `version`
  int default 0 on `communityProfile` + `communityAddress`, all indexes from
  [data model](03-change-request-and-audit-data-model.md). JSON via `text({mode:"json"})`,
  timestamps `integer timestamp_ms`. FK to org only, cascade.
- One drizzle-kit migration + hand-appended `INSERT … SELECT` backfill: one pending `create` request
  per `draft` profile (null submitter, `submitterName` "Unknown", no audit event).
- `src/domain/permission.ts`: add `changeRequest: ["create","review"]`, `auditEvent: ["read"]` to
  roles. **Keep** `manageRelations` until 10 and `approve/reject` until 11 retire them (app must
  keep working).

No behaviour change in the app.

## Acceptance criteria

- [x] migration applies on fresh + existing local D1; backfill test on migrated sqlite
      (`src/test/ sqliteDb.ts`): 2 drafts + 1 active → 2 pending create requests
- [x] permission tests: member create only; admin/owner create + review; `auditEvent.read`
      admin/owner
- [x] `npm run format:fix && npm run lint:fix`, typecheck, tests green

## Comments

- 2026-10-10: done. Migration `0007_change_request_audit_event` (+ hand backfill; verified on
  scratch local D1). `freshDb({ before })` + `applyMigrations(sqlite, { from })` in
  `src/test/sqliteDb.ts` for migration tests. `auditActionsInCategory()` in constants. MCP
  `get_profile` strips `version`.
