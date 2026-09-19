# 01 — Actor gate: orgMiddleware, can(), AppError, useActor

Status: done Depends: — Review candidates: 1, 10

## Why

27 copies of the org-id guard, 9 copies of the 12-line `hasPermission` ritual, session resolved 3×
per request, errors are untyped strings that loaders collapse to 404.

## Spec

### `src/domain/errors.ts`

```ts
export type AppErrorKind = "NotFound" | "Forbidden" | "LimitReached" | "NoActiveOrg";
export class AppError extends Error {
	name = "AppError" as const;
	constructor(
		public kind: AppErrorKind,
		message?: string,
		public code?: string
	) {
		super(message ?? kind);
	}
}
export const isAppError = (e: unknown): e is AppError =>
	typeof e === "object" && e !== null && (e as any).name === "AppError";
```

Verified: TanStack Start serialises thrown errors via seroval; `name`, `kind`, `code` survive to the
client (instance is plain `Error`) — guard by `name`, never `instanceof`.

### `src/domain/permission.ts`

Move `statement`, `ac`, `member`, `admin`, `owner` from `src/lib/permission.ts` (keep a re-export in
lib for better-auth wiring). Add:

```ts
export type Role = "owner" | "admin" | "member";
export type Actor = { userId: string; organizationId: string; role: Role };
export type Permissions = Partial<{
	[K in keyof typeof statement]: (typeof statement)[K][number][];
}>;
export function can(actor: Actor, perms: Permissions): boolean; // roles[actor.role].authorize(perms).success
export function assertCan(actor: Actor, perms: Permissions): void; // throws AppError("Forbidden")
```

Drop the dead `customFields:["read"]` check in `getOrganizationCustomFields`; keep the statement.

### `src/middleware/org.ts`

```ts
export const orgMiddleware = createMiddleware()
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		const organizationId = context.session.session.activeOrganizationId;
		if (typeof organizationId !== "string") throw new AppError("NoActiveOrg");
		const m = await db.query.member.findFirst({
			where: (f, o) =>
				o.and(o.eq(f.organizationId, organizationId), o.eq(f.userId, context.userId)),
			columns: { role: true },
		});
		if (!m) throw new AppError("Forbidden", "Not a member of the active organization");
		return next({
			context: { actor: { userId: context.userId, organizationId, role: m.role as Role } },
		});
	});
```

`authMiddleware` stays for org-less fns (`getMyOrganizationCount`, onboarding). Its `/login`
redirect gains `search: { redirectTo }` (uses `loginHref` after issue 10; inline until then).

### Directory move

`src/api/*` + `src/handler/*` → `src/server/*` (server fns only). `queryOptions` factories move to
`src/queries/*` (issue 09 reshapes them; here just move verbatim). Delete `src/handler/profile.ts`,
`src/lib/cache.ts`. Update all imports.

### Every server fn

Replace `.middleware([authMiddleware])` + guard with `.middleware([orgMiddleware])` and read
`context.actor.organizationId` / `context.actor.userId`. Replace each `hasPermission` block with
`assertCan(context.actor, { communityProfile: ["approve"] })` etc. `notFound()` →
`new AppError("NotFound")` inside fns; loaders only translate `NotFound` → `notFound()`, rethrow the
rest.

### Client

- `authStateFn` returns `{ session, member: { role } | null }` (one extra `member` query when
  `activeOrganizationId` set). Router context type updated.
- `src/hooks/useActor.ts`: `useActor(): Actor | null` from `useRouteContext({ from: "__root__" })`.
- `src/hooks/useCan.ts`: `useCan(perms)` → `can(actor, perms)` (pure, no HTTP).
- Replace `authClient.useActiveMemberRole()` (4 sites) and role string compares (`members/$id:413`,
  `SettingNav:17`, `settings/overview:250`, `settings/members:341`) with `useCan`.
- `src/routes/_authed/_community/settings.tsx` layout `beforeLoad`: `member.role !== "owner"` →
  `redirect("/dashboard")`. Verified: `SettingNav.tsx:8` hides _all_ settings nav for non-owners, so
  the gate is owner-only for every `/settings/*` route.
- `DefaultCatchBoundary`: `isAppError(error)` → per-kind copy; `Forbidden` no longer renders as 404.

## Files

src/domain/{errors,permission}.ts (+tests) · src/middleware/org.ts · src/server/_ (moved) ·
src/queries/_ (moved) · src/hooks/{useActor,useCan}.ts · src/handler/auth.ts→src/server/auth.ts ·
src/routes/\_\_root.tsx · src/routes/\_authed/\_community/settings.tsx (new) ·
DefaultCatchBoundary.tsx

## Acceptance

- `grep -rc "No Organization Id" src` = 0; `grep -rc "hasPermission" src` = 0.
- `grep -rc "useActiveMemberRole" src` = 0.
- Non-owner hitting `/settings/*` is redirected; non-admin calling `acceptCommunityProfile` sees a
  Forbidden message, not 404.
- Tests: `permission.test.ts` full role × permission matrix (owner/admin/member × every statement
  action) ; `errors.test.ts` isAppError guard incl. seroval round-trip
  (`toCrossJSONAsync`/`fromCrossJSON`).

## Comments

Implemented in commit 29fda8e. typecheck/tests/lint/format all clean (1 pre-existing unrelated
tsc error in CommunityNav.tsx re `/memories` route, not touched here).
