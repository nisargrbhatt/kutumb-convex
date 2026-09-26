# 06 — /profile/info → read view + edit drawer

Status: done Depends: 03, 04, 05 Review candidate: 4 · TODO.md item 3

## Why

Always-on inline form: user can't tell what's saved vs pending, default vs custom fields are
undifferentiated.

## Spec

### `src/components/profile/ProfileForm.tsx`

```tsx
<ProfileForm mode="self" | "admin" defaultValues customFieldDefs onSubmit(input: CommunityProfileInput) isPending />
```

`ProfileFieldsSection` (names, gender, blood group, contact, dates) + `CustomFieldsSection`. `mode`
only changes copy (`"Save profile"` vs `"Add member"`) and which submit adapter the parent passes.
Uses `communityProfileFormSchema`, `toFormValues`, `toInput`.

### Route `profile/info/index.tsx`

- Loader: `ensureQueryData(myProfileQuery)`, `ensureQueryData(customFieldDefsQuery)`.
- Has profile → `<PageHeader … actions={<Button onClick=open>Edit</Button>} />` +
  `<ProfileInfoView>`.
- No profile → empty-state `Card` ("No profile yet" + "Create profile" button).
- Both open `<FormDrawer>` containing `<ProfileForm mode="self">`; submit → `useUpsertMyProfile()`
  (issue 09; until then `safeAsync` + invalidate) → close drawer + toast.
- Limit / error: `isAppError` → `limitMessage` / kind copy.

## Acceptance

- `/profile/info` has no `<form>` in the DOM until Edit is clicked.
- Custom fields visibly grouped under their own heading in both view and drawer.
- Mobile: drawer full-width, sticky submit reachable.

## Comments

Implemented. `profile/ProfileForm` = `FormDrawer` + `ProfileFieldsSection` + `CustomFieldsSection`
(deviation: owns `useForm` + drawer since `FormDrawer` owns the `<form>`; props add
`open/onOpenChange/isNew`; `onSubmit(input) → Promise<boolean>`, true closes). `values` +
`keepDirtyValues` re-syncs after save. `mode="admin"` adds Date of Death + "Add member" copy (07
reuses). `ProfileFieldsSection` groups Name / Personal / Contact; selects controlled.

New `profile/ProfileIdentityHeader` (avatar, name, status, nick, contact) extracted from
`members/$id`, used by both. `/profile/info`: identity header + `ProfileInfoView`, Edit in
`PageHeader` actions; no profile → `Empty` + "Create profile". Save = local `useSaveMyProfile`
(`safeAsync` + invalidate profile/usage; TODO issue 09). Limit → `LIMIT_COPY.profileSelf` (not
`limitMessage`, which maps profile code → admin copy).

Fix in `FormDrawer`: `data-[side=right]:w-full` — sheet's `w-3/4` beat plain `w-full`, drawer
wasn't full-width on mobile.

Verified in browser (local test acct): 0 `<form>` before Edit; create → read view; edit prefilled;
clearing nickname persists null; mobile drawer full-width, footer sticky. Custom-field grouping not
clicked (test org had no fields; heading components unchanged from 05). tsc (pre-existing
`CommunityNav` only), lint, format, 111 tests.
