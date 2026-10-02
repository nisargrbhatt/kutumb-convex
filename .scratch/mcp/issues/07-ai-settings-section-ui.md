# AI settings section UI

Type: prototype
Status: resolved
Blocked by: 04

## Question

What does the "AI" section look like and how does it behave? Cover:
- the MCP URL
- per-client setup snippets
- the Connections table (AI Client, org, connected, last used, revoke dialog)
- the empty state
- breadcrumbs and responsive layout
- the consent/org-picker screen, if ticket 04 leaves its look open

Also, from ticket 04: routes `/oauth/select-org` + `/oauth/consent` in `AuthCardShell` are decided;
their look is open. Picker always shown, active org pre-selected; 0 orgs → error card. Duplicate
Connections per client are expected (show "connected"/"last used" to tell them apart). Expired
(>30d idle) Connections stay listed until revoked.

## Answer

Resolved 2026-10-02 (prototype, branch `prototype/mcp-ai-settings` @ d92e229).

- **Placement**: `/profile/ai`, "AI" item in Profile nav, any member. Breadcrumb Home › Profile › AI.
- **Layout = variant B**: Connections table is the page. Header action "Connect AI client" →
  right-side drawer: MCP URL + copy, per-client accordion (Claude, ChatGPT, Claude Code, Cursor) w/
  steps + copyable snippets, read-only note. Plus a "Setup guide" link to docs (new tab).
- **Community filter** above table, default = active org; option "All communities". Community
  column shown (hidden <sm, folded into client cell on mobile).
- **Table cols**: AI Client (name + host), Community, Connected (date), Last used (relative),
  Status, Revoke (icon → `ConfirmDialog`: "loses access to <org> immediately, reconnect from client").
- **Status**: Active / Expired (>30d idle) only. No "Never used" status: Last used shows "Never".
- **Empty state**: shadcn `Empty` + "Connect AI client" CTA opening the same drawer.
- **OAuth screens** (`AuthCardShell`), as prototyped:
  - select-org: radio list (name, slug, role badge), active preselected, Cancel/Continue, "signed
    in as" footer.
  - consent: "Allow <client>?" + verified tick (CIMD) / "Says it's from <host>"; **red** destructive
    "Unverified app" alert for DCR; chosen org card w/ role + "Change" → select-org; 3 bullets
    (read data you can see, acts as you w/ current role, stays until revoked or 30d idle); Deny/Allow;
    footer "Revoke any time in Profile → AI".
  - 0 orgs: "No community yet" + "Create a community" → `/onboarding/create`.

## Comments

- 2026-10-02: Placement decided: `/profile/ai` (settings is owner-only; Connections are personal).
  Prototype on branch `prototype/mcp-ai-settings` (d92e229). `npm run dev`, then:
  - `/profile/ai?variant=A|B|C` (+ `&empty=true`): A setup card + table, B table + connect drawer,
    C split rail + grouped by org.
  - `/oauth-prototype?screen=select|consent-cimd|consent-dcr|no-org`.
