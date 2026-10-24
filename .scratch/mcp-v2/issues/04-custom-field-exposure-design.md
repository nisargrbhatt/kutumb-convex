# Custom field exposure design

Type: grilling Status: resolved Blocked by: 01

## Question

How do Custom Field Definitions and Values reach the AI Client?

- Which discovery mechanism to use.
- Value shape in `get_profile`: by id or label, and whether empty fields are shown.
- Whether `search_profiles` can filter by custom field value.
- How a write tool takes custom field input, so the LLM can't invent fields or mistype values.
- How a definition rename or delete mid-conversation is handled.


## Answer

Resolved 2026-10-22 (grilling).

- **Discovery**: both. `whoami` gains `customFields: [{id,label,type}]`, and a new
  `list_custom_fields` tool returns the same list. Static server instructions say to call one
  first. Tool schemas stay static (per research 01).
- **Field reference**: `field` takes an id or an exact label (case-insensitive, trimmed).
  Responses always carry both. An ambiguous label returns `Invalid` with the matching ids.
- **Unique labels**: per-org unique labels, enforced in `addOrganizationCustomField` on add only.
  Legacy duplicates stay; no migration.
- **`get_profile`**: every definition, in definition order, as `{id,label,type,value}`, with
  `value: null` when unset. Orphan values (deleted definition) are never shown.
- **Cap**: `CUSTOM_FIELD_LIMIT = 50` in `src/lib/limits.ts`, enforced on add.
- **Search**: `search_profiles` gets `customFieldFilters: [{field, op, value}]`, AND, max 5,
  via `json_extract` on `customFieldData`. Ops:
  - text: `eq` (case-insensitive), `contains`
  - number: `eq`/`gt`/`gte`/`lt`/`lte`
  - date: `eq`/`before`/`after` (calendar day)
  - boolean: `eq`
  - all: `isSet`/`isNotSet`
- **Search echo**: when filters are present, each item includes the values of the filtered fields
  only.
- **Write input**: `customFields: [{field, value}]` patch semantics. Listed fields change;
  `value: null` clears. Strict types: number is a JSON number, boolean is `true`/`false`, date is
  `YYYY-MM-DD`. No lenient coercion. An unknown field or type mismatch returns `Invalid`,
  listing the valid fields and their types.
- **Dates on MCP**: `YYYY-MM-DD` in and out. The server converts to and from the stored ISO
  timestamp.
- **Text bound**: 500 chars max, in the shared custom-field value schema (app and MCP).
- **Rename/delete mid-conversation**: fields resolve at call time against current definitions.
  No schema version and no `list_changed`. A deleted field returns `Invalid` with the current
  list.

Facts found: no rename endpoint exists (add/delete only); delete leaves orphan values;
`DatePicker` stores `Date.toJSON()` of local midnight (risks a UTC day shift; out of scope here).
