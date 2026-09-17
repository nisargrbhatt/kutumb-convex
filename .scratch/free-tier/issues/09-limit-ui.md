# 09 — Limit UI: `n/5` create-org, usage card, error toasts

Parent: [PRD.md](../PRD.md) §5, §7 Label: `impl` Status: `ready-for-agent` Depends on:
[08](08-limits-lib-and-enforcement.md)

## Goal

Every cap is visible before it bites and legible when it does. Variant **A** from the prototype,
rewritten cleanly. Reference: branch `prototype/limit-ui` (`f06ab66`) — read
`LimitVariants.prototype.tsx` (variant A) and `UsageVariants.prototype.tsx` (variant A) for exact
layout; **do not merge or cherry-pick** that branch (switcher, variants B/C, `?variant=` plumbing
are throwaway).

## Scope

1. **`/onboarding/create`** (`src/routes/_authed/onboarding/create/index.tsx` +
   `-components/OnboardingForm.tsx`):
   - `loader` → `context.queryClient.ensureQueryData(getMyOrganizationCountQuery())`; component
     reads via `useSuspenseQuery`.
   - `CardTitle` gets inline `Badge` `{count}/{limit}` — `variant="secondary"`, `"destructive"` at
     cap.
   - At cap (`!canJoinOrganization(count)`): `Alert variant="destructive"` with `Lock` icon,
     `AlertTitle = LIMIT_COPY.orgCreate.title`, `AlertDescription = …description`, rendered above
     the form; Create button `disabled`. Form fields stay visible.
   - Fallback: if `createOrganization` still returns `error.code === LIMIT_ERROR_CODES.org`,
     `toast.error(orgCreate.title, { description: orgCreate.description })`.
2. **Settings overview** (`src/routes/_authed/_community/settings/overview/index.tsx`): new
   `UsageCard` between `OrganizationForm` and `DangerZone`. `Card` title "Usage", description "Free
   plan limits for this organization." Two `Progress` rows (`Org Members`, `Community Profiles`)
   with label + mono value `n / 1000`; value class `text-destructive` at cap, amber (e.g.
   `text-amber-600`) at ≥ 90%. Data: `getOrgUsageQuery()` via route `loader` + `useSuspenseQuery`.
   Responsive: rows stack on mobile.
3. **Invitations page** (`src/routes/_authed/onboarding/invitations/index.tsx`,
   `AcceptInvitationAction`): on error, `error.code === LIMIT_ERROR_CODES.org` →
   `toast.error(LIMIT_COPY.orgAccept.title, { description: LIMIT_COPY.orgAccept.description })`;
   otherwise keep generic. On success `router.navigate({ to: "/dashboard" })` instead of only
   `router.invalidate()` ([04](04-onboarding-and-gates-post-rip.md)).
4. **Members page** (`src/routes/_authed/_community/settings/members/index.tsx`, invite handler):
   `error.code === LIMIT_ERROR_CODES.member` → `toast.error(memberInvite.title, { description })`;
   otherwise existing generic toast.
5. **Profile create** — wherever `upsertMyCommunityProfile` / `addMissingMember` are called
   (`grep -rn "upsertMyCommunityProfile\|addMissingMember" src/routes`): ensure the catch toasts
   `error.message` as description with title "Profile limit reached" when the message matches
   `LIMIT_COPY.profileSelf/profileAdmin.description`, generic title otherwise. Simplest:
   `toast.error("Profile", { description: error.message })` if that's the existing precedent — keep
   it.
6. Invalidate `getOrgUsageQuery` after invite send, member remove, profile create/delete so the card
   doesn't go stale (`queryClient.invalidateQueries({ queryKey })`).

## Acceptance

- User with 5 memberships: create page shows `5/5` destructive badge, alert, disabled button. User
  with 2: `2/5` secondary badge, no alert.
- Settings overview shows usage card with live counts; at ≥ 900 value turns amber, at 1000 red.
  (Verify by lowering `MEMBER_LIMIT` locally; restore.)
- Accepting invite at cap → toast with `orgAccept` copy; below cap → lands on `/dashboard`.
- Inviting at member cap → toast with `memberInvite` copy.
- All new UI passes mobile / tablet / desktop breakpoints; breadcrumbs untouched.
- `format:fix`, `lint:fix`, `build` clean.

## Out of scope

Server logic (done in 08). Any inline error UI for accept/invite/profile — toasts only.
