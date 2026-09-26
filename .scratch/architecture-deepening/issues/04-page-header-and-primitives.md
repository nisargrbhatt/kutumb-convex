# 04 — PageHeader + profile display primitives + form containers

Status: done Depends: — (03 recommended first for fullName/initials) Review candidates: 9, 4
(display half)

## Why

11 hand-copied `PageHeader`s; two `StatusBadge`s with different colours; 4 `fullName()`s;
create/edit lives in 4 different containers vs CLAUDE.md rule (drawer for create/edit, dialog for
confirm).

## Spec

### `src/components/CommunityLayout/PageHeader.tsx`

```tsx
<PageHeader crumbs={[{ label: "Members", to: "/members" }, { label: name }]} title? description? actions?: ReactNode />
```

Renders `SidebarTrigger` + `Breadcrumb` (last crumb = `BreadcrumbPage`) + optional title row. Typed
`to` via `LinkProps["to"]`. Responsive: title row wraps under crumbs on mobile.

### `src/components/profile/`

- `ProfileStatusBadge status` — one colour map (`draft` amber, `active` emerald, `inactive` slate).
- `ProfileName profile` (uses `fullName`), `ProfileAvatar profile` (uses `initials`).
- `InfoItem icon label value` — the existing member-detail one, extracted.
- `ProfileInfoView profile customFieldDefs` — two sections: "Details" (default fields via InfoItem
  grid) and "Custom fields" (via `CustomFieldValue`, issue 05; render label-keyed until then).

### `src/components/ui/form-drawer.tsx`

`<FormDrawer open onOpenChange title description form onSubmit submitLabel isPending>` — right
`Sheet`, `ScrollArea` body, sticky footer with Cancel/Submit. All create/edit surfaces use it.

### `src/components/ui/confirm-dialog.tsx`

`<ConfirmDialog open onOpenChange title description confirmLabel destructive onConfirm isPending>` —
`AlertDialog`. Replaces `DeleteRelationDialog` plain `Dialog` and the 3 hand-built `AlertDialog`s.

### Apply

- All 11 routes → `PageHeader`.
- `members/index.tsx` inline pill + `members/$id` `StatusBadge` → `ProfileStatusBadge`.
- `community-tree` `fullName/initials/InfoRow` → profile primitives.
- Delete confirms in addresses, fields, overview, members/$id → `ConfirmDialog`.

## Acceptance

- `grep -rl "function PageHeader" src/routes` = 0;
  `grep -rn "function StatusBadge\|function fullName\|function initials" src` = 0.
- Draft badge identical colour on list, detail, tree panel.
- Manual: every page mobile/tablet/desktop — breadcrumbs visible, no horizontal scroll.

## Comments

Implemented. `CommunityLayout/PageHeader` (Home auto-prepended; title/description/actions row wraps
on mobile), `profile/{ProfileStatusBadge,ProfileName+ProfileAvatar,InfoItem,ProfileInfoView}`,
`ui/form-drawer` (generic over form in/out types, resets form on close, `size: md|lg`),
`ui/confirm-dialog` (blocks close while pending; caller closes on success).

Applied: all 11 routes → `PageHeader` (page title/desc/actions folded in). Status badge on list +
detail → `ProfileStatusBadge`. Community-tree +
members/$id → domain `fullName`/`initials`,
`ProfileAvatar`, `InfoItem`; members/$id details + custom
fields → `ProfileInfoView`. Confirms in addresses, fields, overview, settings/members (remove),
members/$id (delete relation) → `ConfirmDialog`. Drawers: add field, invite member, change role, add
address (was centred `Dialog`), assign user (was `Dialog`) → `FormDrawer`.

Deviations / left:

- Tree panel has no status (graph carries none) — badge parity is list + detail only.
- Tree panel still hides empty rows (filter before `InfoItem`), matching old `InfoRow`.
- Relation surfaces (`AddRelationSheet`, profile/relationships `Dialog` + delete) untouched → 08.
  Profile create/edit forms → 06/07.
- `ProfileInfoView.customFieldDefs` is `{ label }[]` until 05 switches to id keys.
- Inline name joins in relationships page / relation comboboxes left for 08.

Verified: tsc (only pre-existing `CommunityNav.tsx` error), lint, format, 92 tests. Not clicked
through in browser (no local test account) — responsive manual check still owed.
