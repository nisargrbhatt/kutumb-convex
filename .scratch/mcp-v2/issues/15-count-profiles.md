# count_profiles aggregate tool

Type: AFK Status: open Blocked by: 14

Spec: [spec.md § Filters + aggregates](../spec.md)

## What to build

- `count_profiles({...filters, groupBy?})` → `{total, asOf, groups?, otherGroups, otherCount,
  overlapping?}`, live D1 `GROUP BY`.
- `groupBy` core: `gender`, `bloodGroup`, `living`, `city`, `state`, `country`, `birthDecade`;
  custom `text` (normalised) / `boolean`. `number`/`date` → `Invalid` + range-filter hint.
- ≤50 groups by count desc, rest folded; non-empty `null` bucket always; places on `lower(trim)`
  labelled by most common spelling; per-distinct-place counting + `overlapping: true`.
- Description: groups may exceed `total` for places; use `asOf` to turn ages into DOB ranges.

## Acceptance criteria

- [ ] tests: total w/ filters, each core dim, text/boolean custom, number/date rejected
- [ ] >50 groups folded; null bucket; overlap flag on multi-city profile
- [ ] `birthDecade` uses calendar day after edge conversion
