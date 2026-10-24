# MCP write: token scope is necessary, not sufficient

An AI Client may write only when its access token's scope **and** the Connection's live
`oauthConsent.scopes` **and** the org's AI Client writes toggle all include `community:write`. All
three are read in the per-request Actor join that already exists (ADR 0004), so a downgrade or the
owner turning writes off takes effect on the next MCP call. "Make read only" only removes
`community:write` from the consent row (our shrink-only server fn); tokens are left alone because
the better-auth refresh grant copies scopes from the refresh-token row and never re-reads consent,
so the stale claim is harmless rather than revoked. Write is re-gained only by reconnecting through
the consent screen; the plugin's `/oauth2/update-consent` is disabled via `disabledPaths` because it
adds scopes without showing consent.

- **Considered**: trusting `authInfo.scopes` (write would outlive a downgrade until reconnect);
  revoking/rewriting refresh tokens on downgrade (touches plugin-owned rows, still lags for issued
  access tokens); step-up auth (no portable client support).
- **Consequences**: write-tool gating in `tools/list` and `whoami.canWrite` uses effective write,
  not the token. A cached write tool call after a downgrade gets `WriteNotAllowed` with a reason.
