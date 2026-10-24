# Read-only downgrade of a write Connection

Type: grilling Status: resolved Blocked by: 08

## Question

**Consent and Connections UI for write scope** keeps a **Make read only** action in the Manage
drawer: drop `community:write` from a live Connection without revoking it. How does it work?

- Where the cut takes effect: update the `oauthConsent` row's scopes, and/or revoke/rotate refresh
  tokens, and/or check consent scopes per MCP request instead of trusting token `scope`.
- Lag: can an already-issued access token keep writing until expiry? Acceptable bound, or must
  `buildMcpServer` re-check?
- What `whoami.canWrite` and the hidden write tools see right after downgrade.
- Audit: is a downgrade an Audit Event?
- Re-upgrade: reconnect only (same as a read Connection)?

## Answer

Resolved 2026-10-24 (grilling).

Facts checked: `loadConnectionActor` already joins the consent row on every MCP call. The
better-auth refresh grant never re-reads consent: new tokens copy scopes from the refresh-token
row, so a token's `community:write` claim lasts until reconnect. Authorize skips the consent
screen only when consent covers the requested scopes. A consent update keeps `createdAt`. The
plugin's `/oauth2/update-consent` lets a user **add** scopes the client allows, with no consent
screen.

- **Cut**: "Make read only" drops `community:write` from `oauthConsent.scopes` only. Write is
  allowed only when token scope **and** live consent scopes **and** org toggle all include it,
  read in the existing per-request Actor join. Zero lag. The token claim is required but not
  enough on its own.
- **Tokens**: leave refresh and access tokens alone (no revoke, no rewrite of plugin rows). The
  stale claim does nothing.
- **Mid-session**: on the next call, `whoami.canWrite=false` with
  `reason: "connection_read_only"`, and `tools/list` leaves out write tools (gating uses effective
  write, not just `authInfo.scopes`, which tightens **Write tool catalogue and shapes**). No
  `list_changed` push (stateless). A cached write tool call gets `isError` `WriteNotAllowed` with
  reason `connection_read_only` | `org_writes_off` and a hint (reconnect and choose Read and make
  changes / owner turned off AI changes).
- **Audit**: not an Audit Event (those are profile changes only; Revoke isn't one either).
  PostHog `connection_downgraded` only.
- **Pending Change Requests** from the Connection stay pending in Reviews.
- **Who**: only the member who owns the Connection, from their Connections page. Owners use the
  org toggle.
- **Connections table**: icons and subline come only from `oauthConsent.scopes`.
- **Re-upgrade**: reconnect only. The consent screen comes back (consent lacks write), and picking
  write updates the same row (same Connection, history kept).
- **Impl**: our own shrink-only server fn (checks the Connection is the caller's, removes only
  `community:write`, succeeds if already read only). Disable the plugin's `/oauth2/update-consent`
  via `disabledPaths` so write can't be added without the consent screen.
- **ADR**: fold "token scope necessary, not sufficient; live consent scopes + org toggle" into the
  write-scope ADR owed by **Assemble spec and implementation slices**.
