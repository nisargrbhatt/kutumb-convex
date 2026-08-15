# 04 — What actually happens when an organization row is deleted

Parent: [MAP.md](../MAP.md) Label: `wayfinder:task` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: _nothing_

## Question

`customer.subscription.deleted` must delete the organization. Today's Polar `onSubscriptionCanceled`
does a bare `db.delete(organizationTable)` and the comment claims it "cascades all community data" —
verify that claim, because the answer decides how much the delete path in the spec has to do.

AFK, local-only — read `src/db/auth-schema.ts` and `src/db/app-schema.ts` plus the generated
migrations in `drizzle/`.

1. For every table referencing `organization.id` (`member`, `invitation`, `session`?,
   `communityProfile`, `communityProfileCustomField`, addresses, relations, memories, …), record
   whether the FK declares `onDelete: "cascade"` **and** whether the emitted SQL carries it.
2. Confirm D1/SQLite has `PRAGMA foreign_keys` behaviour that makes cascades fire at all through the
   D1 Drizzle driver — SQLite defaults FK enforcement **off**, and this is the failure mode that
   would silently orphan every community row.
3. Note whether `session.activeOrganizationId` points at the deleted org for other members, and what
   they see on their next request (`_authed.tsx` redirects on missing `activeOrganizationId`;
   `getOrgStatus` throws "Organization not found" if it is set but dangling).

## Answer

**Verdict: the "cascades all community data" comment is TRUE for every row keyed on the org. The
only leak is `session.active_organization_id`, which is not a FK and goes dangling.**

Migrations live in `migrations/`, not `drizzle/` (`drizzle.config.ts` sets `out: "./migrations"`).
Audited `src/db/auth-schema.ts`, `src/db/app-schema.ts` and `migrations/0000_material_dazzler.sql`;
`0001` is indexes only.

### 1. Cascade table — direct children of `organization.id`

Every one declares `onDelete: "cascade"` in Drizzle **and** carries `ON DELETE cascade` in the
emitted SQL. No divergence.

| Table                         | Column                   | Drizzle          | Emitted SQL      |
| ----------------------------- | ------------------------ | ---------------- | ---------------- |
| `member`                      | `organization_id`        | cascade          | cascade          |
| `invitation`                  | `organization_id`        | cascade          | cascade          |
| `communityProfile`            | `organizationId`         | cascade          | cascade          |
| `communityProfileCustomField` | `organizationId`         | cascade          | cascade          |
| `communityRelation`           | `organizationId`         | cascade          | cascade          |
| `communityMemory`             | `organizationId`         | cascade          | cascade          |
| `session`                     | `active_organization_id` | **no FK at all** | **no FK at all** |

Second hop, reached via `communityProfile` (SQLite cascades recursively, so these fall with it):

| Table               | Column               | →                     | Cascade |
| ------------------- | -------------------- | --------------------- | ------- |
| `communityAddress`  | `communityProfileId` | `communityProfile.id` | cascade |
| `communityRelation` | `fromId`, `toId`     | `communityProfile.id` | cascade |
| `communityMemory`   | `createdBy`          | `communityProfile.id` | cascade |

`communityRelation` and `communityMemory` are reachable both directly and via profile — either path
removes them. **No table needs an explicit delete step in the spec.**

### 2. FK enforcement on D1 — the feared failure mode does not exist

Bare SQLite defaults `PRAGMA foreign_keys` **off**, but D1 does not:

> "By default, D1 enforces that foreign key constraints are valid within all queries and migrations.
> This is identical to the behaviour you would observe when setting `PRAGMA foreign_keys = on` in
> SQLite for every transaction." — <https://developers.cloudflare.com/d1/sql-api/foreign-keys/>

`CASCADE` is documented as "Updating or deleting a parent key deletes all child keys (rows)
associated to it." Enforcement is not settable per-query (D1 wraps every query in an implicit
transaction); only `PRAGMA defer_foreign_keys = on` exists, to defer violations to
end-of-transaction. Cascade is a database-level behaviour, so the Drizzle `d1` driver is not in the
path and cannot disable it. **No app-level pragma or manual cleanup is required.**

### 3. Orphaned sessions — the one real gap

`session.active_organization_id` is a plain `text` column with **no FK** (`auth-schema.ts:36`), so
deleting an org leaves every member's session pointing at a row that no longer exists. What those
members hit on the next request:

- `src/routes/_authed.tsx:14` only redirects to `/onboarding/create` when `activeOrganizationId` is
  **falsy**. A dangling non-null id passes the gate.
- `_authed/_community.tsx` → `resolveOrgStatus` (`src/lib/org-status.ts`) then does
  `if (!org) throw new Error("Organization not found")` — an unhandled throw into the error
  boundary, not a redirect. **This is a 500-shaped dead end, not a recoverable state.**
- better-auth only sets `activeOrganizationId` in the session `create.before` hook
  (`src/lib/auth.ts:348-367`), so the stale id persists until the session expires or the user signs
  out and back in. Self-healing does not happen.

The owner who cancelled is in the same position as every other member.

**Consequences for the spec (07 owns the mechanics):**

1. The delete path must null out `active_organization_id` for the deleted org — either
   `UPDATE session SET active_organization_id = NULL WHERE active_organization_id = ?` alongside the
   org delete, or by adding a real FK with `onDelete: "set null"` in a migration (DB is clearable,
   so the migration is free). Prefer the FK — it cannot be forgotten by a future delete path.
2. `resolveOrgStatus` should not throw on a missing org; a dangling id should degrade to "no org" so
   the `_authed` gate redirects to `/onboarding/create`. Belt to the FK's braces.
3. Today's Polar handler calls raw `db.delete(organizationTable)`, bypassing better-auth's
   organization-plugin delete hooks (`beforeDeleteOrganization` / `afterDeleteOrganization`). The
   Stripe path should decide deliberately whether to go through the plugin API or keep the raw
   delete; raw is sufficient given the cascade audit above, but the hooks are the place any future
   external cleanup (Stripe customer deletion, R2 assets) would belong.
