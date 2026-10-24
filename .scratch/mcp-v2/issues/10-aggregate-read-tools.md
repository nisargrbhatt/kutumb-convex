# Aggregate and core-filter read tools

Type: grilling Status: resolved Blocked by:

## Question

Which aggregate read tools exist so an AI Client doesn't page every profile to answer counts?
Settle:

- Count and group-by tool(s): one `count_profiles` with optional `groupBy`, or separate tools.
- Groupable dimensions: core columns (gender, blood group, address city/state, status?), Custom
  Field Definitions (by id-or-label, per **Custom field exposure design**), DOB buckets.
- Filters shared with `search_profiles`: add core filters (blood group, DOB range, address city)
  alongside existing `customFieldFilters`.
- Bounds: max groups returned, null/unset bucket, small-count handling.
- Visibility: AI Clients see `active` only (same as `search_profiles`).

Live D1 (`GROUP BY` / `json_extract`) per **Caching design for shared domain reads**.

## Answer

Resolved 2026-10-24 (grilling).

- **Tool**: one `count_profiles({...filters, groupBy?})` → `{total, asOf, groups?, otherGroups,
  otherCount, overlapping?}`. Count only (no sum/avg), single `groupBy` (no cross-tabs v1).
  `asOf: YYYY-MM-DD` lets the LLM turn ages into DOB ranges.
- **Shared filter object** (`domain/communityProfile.ts`, used by `search_profiles` +
  `count_profiles`), AND across fields: `query`, `gender`, `bloodGroup[]` (OR within),
  `bornOnOrAfter`/`bornOnOrBefore` (`YYYY-MM-DD`), `city`/`state`/`country` (case-insensitive
  trimmed exact, any address matches), `living` (bool, from `dateOfDeath`), `customFieldFilters`
  (per **Custom field exposure design**). No `age` param. Search items echo filtered core fields
  (like custom-field echo).
- **Deceased**: included by default. `living` is both filter and groupBy dim. Description tells
  the model to pass `living: true` for "alive / today" questions. Glossary: deceased ≠ `inactive`.
- **groupBy** = `{core}` | `{field}`:
  - core: `gender`, `bloodGroup`, `living`, `city`, `state`, `country`, `birthDecade`.
  - custom: `text` (normalised) and `boolean` only. `number`/`date` → `Invalid` with hint to use
    range filters.
  - Not groupable: names, email, mobile.
- **Addresses**: profile counted once per distinct city/state/country it has an address in. Groups
  can add up to more than `total` (`overlapping: true` + description note). No address → `null` bucket.
- **Place normalisation**: group on `lower(trim(x))`, label = most common original spelling. No
  alias table (Bombay/Mumbai stay separate).
- **birthDecade**: calendar day of stored DOB after the same edge conversion as custom-field dates.
  No age bands.
- **Bounds**: ≤50 groups by count desc; rest folded into `otherGroups`/`otherCount`; non-empty
  `null` bucket always returned; no small-count suppression (members already see all active).
- **Visibility**: `active` only, all roles; no status filter/dim.
- **Store**: live D1 `GROUP BY` / `json_extract`, uncached (per **Caching design**).

Facts found: search today = name `query` + `gender` only; addresses 0..n per profile with free-text
city/state/country and nullable `type`; `dateOfBirth`/`dateOfDeath` ISO text; no marital-status
column despite `COMMUNITY_PROFILE_RELATIONSHIP` enum.
