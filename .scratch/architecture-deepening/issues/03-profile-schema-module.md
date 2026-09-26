# 03 — Community Profile schema module + clear-field fix

Status: done Depends: 01 Review candidate: 3

## Why

Blood group / gender / relation-type enums spelled out 5×; `z.date` (routes) vs `z.string` (server)
drift; every form re-implements `"" → undefined`, which makes `update().set({x: undefined})` skip
the column — users can never clear an optional field.

## Spec

### `src/domain/communityProfile.ts`

```ts
export const genderSchema = z.enum(Object.values(GENDERS));           // same for bloodGroup, status
export const communityProfileInput = z.object({ firstName: z.string().min(1), middleName: z.string().nullable(), ..., dateOfBirth: z.string().datetime().nullable(), dateOfDeath: ..., customFieldData: customFieldValuesSchema.nullable() });
export type CommunityProfileInput = z.infer<typeof communityProfileInput>;
export const communityProfileFormSchema = /* same but dates are z.date().optional(), strings optional */;
export type CommunityProfileFormValues = z.infer<typeof communityProfileFormSchema>;
export function toFormValues(row: CommunityProfileRow | null): CommunityProfileFormValues;
export function toInput(values: CommunityProfileFormValues): CommunityProfileInput; // "" | undefined → null, Date → ISO
export const memberFilterSchema = z.object({ q: z.string().default(""), status: statusSchema.or(z.literal("")).default(""), gender: ..., page: z.number().int().min(1).default(1), pageSize: ... });
export function fullName(p: Pick<Row,"firstName"|"middleName"|"lastName">): string;
export function initials(p): string;
```

Server: `upsertMyCommunityProfile` / `addMissingMember` `.validator(communityProfileInput)` (admin
path omits `comment`: `communityProfileInput.omit({ comment: true })`). `set()` receives `null` for
cleared columns — nothing skipped.

### `src/domain/relation.ts`

`relationTypeSchema = z.enum(Object.values(COMMUNITY_RELATION_TYPE))`, `formatRelationType()`.
Replace the two inline copies in `communityRelation.ts:14,167` and route copies. Drizzle enums in
`app-schema.ts` use `Object.values(...)` from constants.

### Routes

`profile/info`, `members/create` import `communityProfileFormSchema` + `toFormValues`/`toInput`;
delete local schemas and the 15-line strip blocks. `members/index.tsx` `validateSearch` uses
`memberFilterSchema`; `getCommunityMembers` validator uses it too (3 shapes → 1).

## Acceptance

- `grep -rn 'COMMUNITY_PROFILE_BLOOD_GROUP\["A+"\]' src` = 0 outside constants.
- Clearing "Middle name" and saving persists `null` and the field renders empty after reload.
- Tests: `communityProfile.test.ts` — `toInput` maps `""`→`null`, Date→ISO, round-trips through
  `toFormValues`; `memberFilterSchema` defaults; `fullName`/`initials` edge cases (no middle,
  unicode). `relation.test.ts` — schema accepts every constant, rejects unknown.

## Comments

Implemented. `src/domain/communityProfile.ts` (`communityProfileInput`, `communityProfileFormSchema`,
`toFormValues`, `toInput`, `memberFilterSchema` + `MEMBER_FILTER_DEFAULTS`, `fullName`, `initials`)
and `src/domain/relation.ts` (`relationTypeSchema`, `formatRelationType`), both w/ tests.
`enumValues()` in constants feeds every Drizzle `text({ enum })`; zod uses `z.enum(CONST)` directly.

Deviations:

- `comment` dropped from `communityProfileInput` entirely (no form has it; server-owned). Upsert no
  longer touches it — otherwise self-save would null the admin's "Added by…" note after reassign.
- Filter key stays `search` (not `q`) — avoids URL churn. `stripSearchParams(MEMBER_FILTER_DEFAULTS)`
  keeps URLs clean now that defaults are filled.
- Form `email` accepts `""` (clearing email used to fail validation — same bug class).
- `customFieldData` still `z.record(string, unknown)`; id-keyed schema is issue 05.
- Callers of `fullName`/`initials` (community-tree etc.) not migrated — issue 04. Community-tree
  `capitalizeFirstLetter` for relation edge labels left for 08.

Verified: tests/lint/format/tsc (same pre-existing `CommunityNav.tsx` error). Clear-field fix
checked by asserting drizzle `update().set(toInput(...))` SQL emits `"middleName" = NULL`; not
clicked through in browser (no local test account).
