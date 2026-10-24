# Custom field reads

Type: AFK Status: resolved Blocked by:

Spec: [spec.md § Custom field reads](../spec.md)

## What to build

- `addOrganizationCustomField`: per-org unique label (case-insensitive, trimmed) and
  `CUSTOM_FIELD_LIMIT = 50` (`src/lib/limits.ts`), on add only. Shared value schema: text ≤500.
  App add-field form shows both errors.
- Field-ref resolver (id or label → definition; ambiguous → `Invalid` with ids; unknown →
  `Invalid` with current list), reused by 14 and 19.
- `whoami.customFields: [{id,label,type}]`; new `list_custom_fields` tool; server instructions
  say call one first.
- `get_profile.customFields`: every definition, in order, `{id,label,type,value|null}`; orphans
  hidden. `dateOfBirth`/`dateOfDeath`/date values as `YYYY-MM-DD` (edge conversion helper).
  Queries under `Promise.all`.

## Acceptance criteria

- [ ] domain tests: duplicate label rejected, 51st def rejected, 501-char text rejected
- [ ] resolver tests: id, label (case/space), ambiguous, deleted
- [ ] tool tests: unset → `null`, orphan hidden, dates `YYYY-MM-DD`, `list_custom_fields` = whoami
- [ ] app custom-field settings page shows new errors, responsive

## Comments

- 2026-10-24: Implemented on `feat/mcp-improvements` (slice branch merged; review fixes in `fix/mcp-v2-review`, integration 83562ce). Tests/tsc/lint/build green. Browser verification: still pending (implementers skipped it to avoid dev-server clashes).
