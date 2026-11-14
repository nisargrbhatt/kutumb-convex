# Lock enforcement seam

Type: grilling Status: resolved Blocked by: 05

## Question

Where is the Lock enforced so nothing slips through? Decide the seam (authMiddleware, a separate
billing middleware, `_authed` route gate, MCP request path, better-auth org hooks for invites), the
exempt routes/server fns (per charting list), latency/caching of the check on every request, how a
client learns it's locked (error code → lock screen), and behaviour of an MCP Connection on a Locked
org (error message an AI Client can relay).

## Comments

- From plugin research (02): webhook route should live outside `/api/auth` and itself be exempt from
  the Lock; checkout/portal server fns are owner-only via `assertCan`.
- From 05: gate on `billingAccess(row, now).locked` over the D1 `orgBilling` row; `lockReason` picks
  lock-screen copy. Decide KV/caching here.

## Answer

Grilled 2026-11-14. Lock is per org, never per user: a user with a locked org can always switch org,
sign out, create a new org, accept invites elsewhere.

1. **Server fn seam:** check inside `orgMiddleware`, default-deny. Variant
   `orgMiddlewareAllowLocked` only for: billing read / checkout / portal, delete org, transfer
   ownership.
2. **Cost:** no KV (staleness breaks instant unlock). LEFT JOIN `orgBilling` into the member query
   `orgMiddleware` already runs; `billingAccess(row, now)` in memory. Zero extra round trips.
3. **Route gate:** `_community.tsx` `beforeLoad` → locked → redirect `/_authed/locked` (outside
   `_community`); `/locked` → redirect dashboard when not locked. Variants:
   - Owner: reason copy, Re-subscribe / Update payment (portal), Delete org + Transfer ownership
     dialogs.
   - Admin/member: "ask an owner", Leave organization (`authClient.organization.leave`).
   - Everyone: org switcher (reuse `CommunityPicker`), sign out + account menu (reuse `AuthUser`),
     create new org link. Full billing settings page stays in `_community` (unlocked only).
4. **better-auth org hooks:** blocked under Lock: `beforeCreateInvitation`,
   `beforeUpdateOrganization`, `beforeUpdateMemberRole` unless actor is owner (transfer). Allowed:
   removeMember / leave, cancelInvitation, delete (06 cancel-first flow), setActive, accepting a
   pending invite into a locked org (lands on `/locked`).
5. **Client signal:** new `AppError` kind `"Locked"`, `code = lockReason`. Global Query/mutation
   `onError` → `router.invalidate()` → gate redirects. Covers Lock starting mid-session.
6. **MCP:** `loadConnectionActor` joins `orgBilling`; locked org still authenticates (no 401 loop),
   `tools/list` works, every tool call → `isError`:
   `OrgLocked (<reason>): "<org>" is locked: <reason copy>. Its data is safe. Tell the user an owner must subscribe at <app>/locked; retrying won't help.`
   (`toolErrorResult` maps `Locked`.)
7. **Blobs:** `/api/blob/<orgId>/…` GET + PUT → 403 when locked.
8. **OAuth:** select-org shows locked orgs disabled; `pickOauthOrgFn` refuses them.
9. **Exempt:** `/api/auth/*`, Dodo webhook route, `/api/ph`, `.well-known/*`, `/oauth/*` (minus 8),
   `/onboarding/*`, `/login` etc.; fns: org count, my invitations, my Connections
   (list/revoke/downgrade).
10. No account settings page built here; account menu = what `AuthUser` offers today.

No ADR (default-deny middleware + no-KV are cheap to reverse). No glossary change (Lock already says
per organization).
