# Consent and Connections UI for write scope

Type: prototype Status: resolved Blocked by: 05

## Question

How does `community:write` look in the consent screen (separate opt-in, risk copy, what
owner/admin vs member writes mean)? How does the Connections table show read vs read+write, and how
does a member upgrade an existing read Connection? Also: the owner-only "AI Client writes" org
toggle (default on) in org settings, with risk copy, and the "via <client>" attribution badge in
Reviews/History/My requests.


## Answer

Resolved 2026-10-24 (prototype). Variant **B** (access-level cards) chosen as-is. Prototype: branch
`prototype/write-consent-ui` (local, throwaway), route `/prototype-write-consent?variant=B`, scenario
via `?role=&org=&ask=`.

- **Consent**: when client requests `community:write`, read bullets are replaced by "What can Claude
  do?" with two radio cards: **Read only** (default) / **Read and make changes** (adds/edits, no
  deleting, plus role effect: owner/admin "apply right away", member "go to owners/admins as
  requests"). Org toggle off → write card disabled, "Turned off by your community." Client asks read
  only → today's screen unchanged. One-line footer: acts as you, 30 days unused. Allow sends
  `consent({accept:true, scope})` with the subset (better-auth `consentEndpoint` accepts a scope
  subset of the original request; verified in `@better-auth/oauth-provider` dist).
- **Connections table**: no new column. Client cell shows Eye (+ amber Pencil if write) icons and a
  "Read only" / "Read and make changes" subline. Per-row **Manage** button opens right drawer:
  - write Connection → "Stop changes, keep reading" + **Make read only** (kept in v1, see
    **Read-only downgrade of a write Connection**).
  - read Connection → "Allow changes": reconnect from the client (remove + re-add Kutumb, pick Read
    and make changes); old Connection is replaced (better-auth updates the consent row by
    clientId+userId).
  - Revoke moves into the drawer.
- **Upgrade path**: reconnect from the client only. Kutumb can't push a scope; no step-up. Clears the
  Connection-migration fog.
- **Owner toggle**: new **Settings → AI** tab, card "What can AI Clients do in this community?", radio
  cards Read only / Read and make changes. Owner-only (others see disabled + "Only the owner can
  change this"). Switching to read only → ConfirmDialog ("Write tools disappear for everyone right
  away. Pending AI requests stay in Reviews. Members aren't notified.").
- **Attribution**: byline under submitter name, `Bot` icon + "via <client name>" muted text, in
  Reviews, profile History, My requests.
- Not chosen: A (inline checkbox, Access column, pill badge), C (second consent step, row drawer with
  quota bar + recent changes, avatar badge). No quota usage shown in UI in v1.
