# 05 — Custom fields keyed by id + display adapter

Status: done Depends: 03, 04 Review candidate: 4 (custom-field half) · CONTEXT.md: Custom
Field Definition / Value

## Why

`customFieldData` keyed by label → rename orphans data; display does `String(val)` (booleans →
"true", dates → ISO); `getCommunityMemberById` returns only labels (types lost); no read-only
rendering on `/profile/info`.

## Spec

### `src/domain/customFields.ts`

```ts
export const customFieldTypeSchema = z.enum(Object.values(CUSTOM_FIELD_TYPE));
export type CustomFieldDefinition = { id: string; label: string; type: CustomFieldType };
export const customFieldValuesSchema = z.record(
	z.string() /* def id */,
	z.union([z.string(), z.number(), z.boolean(), z.null()])
);
export type CustomFieldValues = z.infer<typeof customFieldValuesSchema>;
export function formatCustomFieldValue(
	def: CustomFieldDefinition,
	value: unknown,
	opts?: { dateFormat?: string }
): string; // "—" for null/undefined, "Yes"/"No", formatted date, number toLocaleString
export function valuesForDefs(defs, values): Array<{ def; value }>; // ordered by defs, drops orphan ids
```

`app-schema.ts`: `customFieldData: blob({mode:"json"}).$type<CustomFieldValues>()`. No structural
migration; DB wiped.

### Components (`src/components/custom-fields/`)

- `CustomFieldInput def` — one field by type (extracted from `CustomFieldsForm`), name =
  `customFieldData.${def.id}`.
- `CustomFieldsSection defs` — grid of inputs; replaces `CustomFieldsForm`.
- `CustomFieldValue def value` — uses `formatCustomFieldValue`; boolean renders check/x icon.

### Server

- `getCommunityMemberById` returns `customFieldDefs: CustomFieldDefinition[]` (id, label, type), not
  `labels`. `getOrganizationCustomFields` returns bare `CustomFieldDefinition[]` (drop the
  `{message,data}` envelope; update callers).
- `deleteOrganizationCustomField` — leave values in place (orphans are dropped by `valuesForDefs`);
  no per-profile rewrite.

### Apply

`ProfileInfoView` custom section, `members/$id`, community-tree `ProfilePanel` use
`CustomFieldValue`. `profile/info`, `members/create` forms use `CustomFieldsSection`.

## Acceptance

- `grep -rn "field.label}\`" src` = 0 (no label-keyed form names).
- Boolean custom field shows Yes/No; date shows `dd MMM yyyy`; missing shows "—".
- Renaming a definition label keeps values visible.
- Tests: `customFields.test.ts` — format per type incl. null, invalid date string, orphan-id drop,
  def ordering.

## Comments

Implemented. `domain/customFields.ts`: `customFieldTypeSchema`, `CustomFieldDefinition`,
`customFieldValuesSchema` (id-keyed scalars), `formatCustomFieldValue` ("—" blank, Yes/No,
`dd MMM yyyy`, `toLocaleString`; invalid/mismatched shape → shown as stored), `valuesForDefs`,
plus `toCustomFieldValues` (form → wire, drops `undefined`/blank/non-scalar so a cleared field is
removed). `communityProfileInput.customFieldData` = `customFieldValuesSchema`; `toInput` strips via
`toCustomFieldValues`. `app-schema` typed `$type<CustomFieldValues>()`.

Components `custom-fields/{CustomFieldInput,CustomFieldsSection,CustomFieldValue}`;
`CustomFieldsForm` deleted. Server: `getCommunityMemberById` → `customFieldDefs`,
`getOrganizationCustomFields` → bare `CustomFieldDefinition[]` (settings/fields, profile/info,
members/create updated). Delete leaves orphan values.

Deviations / left:

- Community-tree `ProfilePanel` not wired: graph nodes carry no `customFieldData`/defs; adding would
  grow the graph payload. Revisit with 11 (read module) if wanted.
- `formatCustomFieldValue` dash is "—" per spec; core `ProfileInfoView` fields still use "-".

Verified: tsc (only pre-existing `CommunityNav.tsx` error), lint, format, 111 tests. Not clicked
through in browser.
