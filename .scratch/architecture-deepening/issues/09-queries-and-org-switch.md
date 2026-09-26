# 09 — queries/: key factories, mutation hooks, switchOrganization

Status: done Depends: 01 Review candidate: 6

## Why

13 static query keys carry no tenant → org switch is `window.location.reload()`; 18 ad-hoc
`invalidateQueries` sites in 3 idioms; `staleTime:0,gcTime:0` workaround.

## Spec

### `src/queries/<domain>.ts` (one per server file)

```ts
export const profileKeys = {
  all: (orgId) => ["profile", orgId] as const,
  mine: (orgId) => [...profileKeys.all(orgId), "mine"] as const,
  list: (orgId, filters: MemberFilters) => [...profileKeys.all(orgId), "list", filters] as const,
  detail: (orgId, id) => [...profileKeys.all(orgId), "detail", id] as const,
  activeCount: (orgId) => ..., forRelation: (orgId, subjectId) => ...,
};
export const myProfileQuery = (orgId) => queryOptions({ queryKey: profileKeys.mine(orgId), queryFn: () => getMyCommunityProfile() });
export function useUpsertMyProfile() { const qc = useQueryClient(); const { organizationId } = useActor()!; const posthog = usePostHog();
  return useMutation({ mutationFn: (input) => upsertMyCommunityProfile({ data: input }),
    onSuccess: () => { toast.success("Profile saved"); posthog.capture("profile_saved"); qc.invalidateQueries({ queryKey: profileKeys.all(organizationId) }); qc.invalidateQueries({ queryKey: orgKeys.usage(organizationId) }); },
    onError: (e) => toast.error(isAppError(e) ? kindMessage(e) : "Something went wrong") }); }
```

Same shape for: `useAddMissingMember`, `useApproveProfile`, `useRejectProfile`,
`useReassignProfile`, `useAddMyRelation`, `useDeleteMyRelation`, `useAddRelationToProfile`,
`useDeleteRelationFromProfile`, `useUpsertAddress`, `useDeleteAddress`, `useCreateCustomField`,
`useDeleteCustomField`, `useInviteMember`, `useRemoveMember`, `useChangeRole`,
`useUpdateOrganization`, `useDeleteOrganization` (org ones wrap `authClient.organization.*`; map
`error.code` via `limitMessage`).

Invalidation sets are the _whole point_: `useDeleteCustomField` invalidates `profileKeys.all` too;
`useRejectProfile` invalidates `orgKeys.usage`. Remove `staleTime:0,gcTime:0` from `myProfileQuery`.

Loaders: `ensureQueryData(myProfileQuery(context.session.session.activeOrganizationId!))`.

### `switchOrganization` (`src/queries/organization.ts`)

```ts
export function useSwitchOrganization() {
	return async (organizationId) => {
		await authClient.organization.setActive({ organizationId });
		queryClient.clear();
		await router.invalidate();
		await router.navigate({ to: "/dashboard" });
	};
}
```

`CommunityPicker` uses it; no `window.location.reload()`.

### Client mutation idiom

Routes never call `safeAsync(serverFn)` / `router.invalidate()` / `toast` for mutations directly —
only hooks. `safeAsync` stays for loaders.

## Acceptance

- `grep -rn "window.location.reload" src` = 0; `grep -rn "staleTime: 0" src` = 0.
- `grep -rn "invalidateQueries" src/routes` = 0 (all inside `src/queries`).
- Switching org in picker updates dashboard counts without reload; back button doesn't show stale
  org.
- Tests: `queries/keys.test.ts` — every factory's key starts with `[domain, orgId]`.

## Comments

Implemented. `queries/keys.ts` (pure): `profileKeys`/`relationKeys`/`addressKeys`/`fieldKeys`/
`orgKeys` all `[domain, orgId, ...]`; `accountKeys` user-scoped (org count). `keys.test.ts` walks
every factory. `queries/mutation.ts`: `useOrgId`, `toastMutationError` (limit code → `LIMIT_COPY`,
per-site override), `unwrap` (better-auth `{data,error}` → throw w/ `code`).

Hooks: spec list + `useCancelInvitation`/`useResendInvitation`, `useCreateOrganization`,
`useAccept/RejectInvitation` (onboarding off direct authClient/toast too). `useUpsertAddress` →
`useAddMyAddress` (server has add only). Invalidation: relation muts → `relationKeys.all` +
`profileKeys.all` (detail/graph); address + field delete → `profileKeys.all` too.

Deviations:
- Org change (`useResetToOrg`): navigate → `router.invalidate` → `removeQueries` for previous org,
  not `clear()` first — clearing while old-org views mounted re-suspends them; navigating first
  unmounts them before root context drops the org.
- `_community` `beforeLoad` returns `{ organizationId }`, `_authed` returns `{ userId }`; loaders
  use `context.organizationId`, components `Route.useRouteContext()`.
- `/members/$id` loader → `ensureQueryData(memberDetailQuery)` (was raw loader data), so
  approve/reject/reassign/relations invalidate by key, no `router.invalidate`.
- Fix: `QueryClient` was a module singleton → shared across SSR requests (cross-user/tenant cache
  on Workers). Now created per `getRouter()`; `lib/query-client.ts` deleted.

Verified in browser (local): create 2nd org → dashboard shows new org (0 members) no reload; picker
switch back → counts 2, JS state kept (no reload); field add/delete via drawer/confirm; member
detail renders, bad id → 404; invites tab; delete org → onboarding, count 1/5. tsc (pre-existing
`CommunityNav` only), lint, format, 133 tests.
