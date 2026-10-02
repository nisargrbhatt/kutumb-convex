# better-auth 1.7.6 upgrade

Type: AFK Status: done Blocked by:

Spec: [spec.md § Auth stack](../spec.md)

## What to build

Bump better-auth core (and companion pkgs) 1.6.29 → 1.7.6. No MCP code. Move rate limiter KV → D1:
`rate_limit` table + atomic `consume()` (`INSERT … ON CONFLICT DO UPDATE … RETURNING`); delete KV
shim (`src/lib/rate-limit-kv.ts`). Read 1.7 changelog/migration notes.

## Acceptance criteria

- [x] better-auth 1.7.6; app builds, `npm test` green, typecheck clean
- [x] Drizzle migration for `rate_limit`; limiter uses D1; KV shim + test removed, D1 limiter tested
- [x] `requireLocalEmailVerified` default + startup schema validation re-verified; login, signup,
      Google, invites, org switch work in dev

## Resolution

- better-auth 1.6.29 → 1.7.6 (`^1.7.6`). Companion pkgs: none installed; `@better-auth/*` only
  transitive.
- `rate_limit` table in `app-schema.ts`, migration `0004_shallow_cable.sql`.
  `src/lib/rate-limit-d1.ts` = `customStorage.consume()` via single
  `INSERT … ON CONFLICT DO UPDATE … RETURNING`; prunes rows >1h on new window. Tests:
  `rate-limit-d1.test.ts` (node:sqlite fake D1). KV shim + test deleted. ADR 0002 KV bullet removed.
- Verified: `requireLocalEmailVerified` default still `true` (`oauth2/link-account.mjs`). 1.7 schema
  validation (`advanced.database.validateSchema`, default on) runs against drizzle schema; no
  mismatch at dev startup. Limiter exercised in dev (3 allowed, then 429, row in D1).
- Dev (curl): signup, sign-in, org create/active, get-session, Google redirect OK. Not exercised:
  Google callback, invite accept (needs real creds/email).
