# 02 — Limits module: assert\*Slot + LimitError

Status: done Depends: 01 Review candidate: 5 · ADR-0003 unchanged

## Why

"count → compare → capture → throw" copied 4× (`lib/auth.ts:43-70`,
`api/communityProfile.ts:140,779`); hooks throw `APIError{code}` while server fns throw
`Error(LIMIT_COPY.description)` → client handles limits two different ways.

## Spec

### `src/domain/limits.ts` (extend existing)

```ts
export class LimitError extends AppError { constructor(public limit: "org" | "member" | "profile") { super("LimitReached", undefined, LIMIT_ERROR_CODES[limit]); } }
export type Counters = { userMemberships(userId): Promise<number>; orgMembersAndPending(orgId): Promise<number>; orgProfiles(orgId): Promise<number> };
export const makeLimits = (counters: Counters, onReached: (e: { limit; organizationId?; userId }) => void) => ({
  assertOrgSlot(userId), assertMemberSlot(organizationId), assertProfileSlot(organizationId, userId) // each throws LimitError
});
```

Pure: takes a `Counters` adapter; production adapter = existing `src/lib/limits-db.ts`; `onReached`
= `captureLimitReached`. `src/lib/limits.ts` becomes
`export const limits = makeLimits(dbCounters, captureLimitReached)`.

### Callers

- `upsertMyCommunityProfile`, `addMissingMember` → `await limits.assertProfileSlot(...)`.
- `beforeAcceptInvitation`, `beforeCreateInvitation` (moved to `src/lib/auth-hooks.ts` in issue 10;
  edit in place now) →
  `try { await limits.assertX() } catch (e) { if (e instanceof LimitError) throw new APIError("FORBIDDEN", { code: e.code, message }) ; throw e }`.
- Client: one `limitMessage(codeOrError)` helper in `src/domain/limits.ts` mapping `code` →
  `LIMIT_COPY`; used by both `safeAsync` results (`isAppError && kind==="LimitReached"`) and
  better-auth client errors (`error.code`). `LIMIT_COPY` never sent from server.

## Acceptance

- `grep -rn "canCreateProfile\|canJoinOrg\|canInvite" src --include=*.ts` only inside
  `src/domain/limits.ts` + tests.
- `limits.test.ts`: assert fns with fake counters at n-1, n, n+1 for all three; `onReached` called
  exactly once on throw; existing pure tests kept.

## Comments

Implemented (`src/domain/limits.ts`: `LimitError`, `Counters`, `makeLimits`, `limitMessage`;
`src/lib/limits.ts` now just `limits = makeLimits(dbCounters, captureLimitReached)`). Callers
(`auth.ts` hooks, both profile-slot sites in `server/communityProfile.ts`) call
`limits.assertXSlot`, catch `LimitError`, rethrow with the existing site-specific `LIMIT_COPY`
message (self/admin/accept/invite copy preserved — spec's generic message would've regressed UX).
`LIMIT_ERROR_CODES` gained a `profile` code (didn't exist before). typecheck/tests/lint/format
clean (same pre-existing unrelated `CommunityNav.tsx` tsc error as issue 01, untouched here).
