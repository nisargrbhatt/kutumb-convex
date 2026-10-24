# Shared profile filters on search_profiles

Type: AFK Status: open Blocked by: 13

Spec: [spec.md § Filters + aggregates](../spec.md)

## What to build

- Filter object + D1 predicate builder in `src/domain/communityProfile.ts`: `query`, `gender`,
  `bloodGroup[]`, `bornOnOrAfter`/`bornOnOrBefore`, `city`/`state`/`country` (any address,
  `lower(trim)` exact), `living`, `customFieldFilters` (max 5, `json_extract`, ops per type, field
  refs via 13's resolver). `active` only.
- `search_profiles` input = filter object (+ existing paging ≤100). Items echo filtered core +
  custom values only. Description: `living: true` for "alive/today".

## Acceptance criteria

- [ ] predicate tests per field and per custom op/type, AND across fields, OR within bloodGroup
- [ ] multi-address profile matches on any address
- [ ] wrong op for type / >5 filters → `Invalid` with hint
- [ ] echo contains only filtered fields
