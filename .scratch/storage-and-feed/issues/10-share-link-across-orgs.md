# Share link when another org is active

Type: grilling Status: resolved Blocked by:

## Question

A member opens a shared Post link while a different org is active, or while signed out.
`activeOrganizationId` scopes every query today. Does the link carry the org, does opening it switch
the active org, and what does a non-member or a removed Post show without leaking that the Post
exists?

A removed Post is a hard delete, so it leaves no row: see
[Memory lifecycle](08-memory-lifecycle.md).

## Answer

Link:

- Plain `/feed/$postId`, no org in the URL. Post id is globally unique, so the server finds the org
  from the Post. A slug in the URL would show the community to anyone who sees the link.
- One small read skips active org scoping: looks up the Post's org and checks the viewer's
  membership itself. Uses `authMiddleware`, not `orgMiddleware`.

Member with another org active:

- Auto-switch to the Post's org and stay on the Post, with a toast naming the community. No Dialog
  or interstitial: opening the link is the intent.
- Common case, not an edge: a new session starts on the user's first org.
- Loader only reports "other org". The page component does the switch, because
  `defaultPreload: "intent"` runs loaders on hover and a loader must not change session state.
- Showing the Post without switching is rejected: shell, likes and comments all use the active org.
- Other open tabs move too, same as the org switcher today. Accepted.

Non-member, removed Post, id never existed:

- One identical not-found, existing `NotFound`, same server response. Covers ex-members and invitees
  who haven't accepted. No org name, no invite hint, no "removed" message, so ids can't be probed.

Signed out or no org:

- No new flows. Signed out: login with `redirectTo` (email and Google both keep it), then the rules
  above. Same for every id, so nothing leaks.
- Page `head` stays generic, no Post title. Chat apps show no preview.
- New signup with zero orgs goes to onboarding and the link is dropped. They reopen it after
  joining.
