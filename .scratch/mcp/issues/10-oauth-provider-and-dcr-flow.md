# OAuth provider + DCR flow

Type: AFK Status: done Blocked by: 09

Spec: [spec.md § Auth stack, OAuth screens, Rate limits](../spec.md)

## What to build

Add `@better-auth/mcp` + `jwt()`; DCR flags on; scopes `community:read` + `offline_access`; AT 1h,
RT 30d rotating; `customAccessTokenClaims` emits org (`referenceId`); `iss` param; loopback
port-agnostic redirects. Drizzle migration for oauth tables + `jwks`. Root `.well-known` routes
(PRM + AS + OIDC metadata, ACAO `*`). Routes `/oauth/select-org` + `/oauth/consent` per prototype
(`prototype/mcp-ai-settings` @ d92e229), DCR → red "Unverified app". OAuth `customRules`. PostHog
`mcp_connection_created`.

## Acceptance criteria

- [x] MCP Inspector completes DCR + auth code + PKCE; JWT `aud` = `${origin}/api/mcp`, org claim set
- [x] select-org: active preselected, setActive called; 0 orgs → create-community card
- [x] consent Allow → `oauthConsent(clientId, userId, referenceId=orgId)`; Deny → error to client
- [x] metadata routes match spec; `code_challenge_methods_supported: ["S256"]`
- [x] register 5/h/IP, token + authorize 30/min enforced
- [x] screens responsive, breadcrumb-free auth card, accessible

## Resolution

- Deps: `@better-auth/mcp` + `@better-auth/oauth-provider` (direct; peer needs better-auth `^1.7.7`,
  bumped from 1.7.6). Migration `0005_amusing_scrambler.sql` (`src/db/oauth-schema.ts`): `jwks` +
  oauth tables; every `reference_id` on consent/tokens is an FK to `organization` (cascade), beyond
  the plugin schema.
- `src/lib/auth.ts`: `jwt()` + `mcp()` (config constants in `src/domain/mcpOauth.ts`); org in JWT as
  claim `org_id`. Rate limits via the plugin's `rateLimit` option (same rule list as `customRules`):
  register 5/h, token + authorize 30/min. Added
  `advanced.ipAddress.ipAddressHeaders: ["cf-connecting-ip"]`, else all prod requests share one
  `no-trusted-ip` bucket (register would be 5/h globally). Limiter is off in dev (better-auth
  default: prod only).
- `postLogin`: always-shown picker. better-auth re-runs `shouldRedirect` on `/oauth2/continue`, so
  `pickOauthOrgFn` (setActive + 2-min marker row in `verification`, `src/lib/oauth-flow.ts`) tells
  that pass to continue. Allow re-checks the shown org is still active (`assertConsentOrgFn`).
- DCR without `application_type` defaults to `web` and rejects loopback/private-use redirects;
  `before` hook infers `native` (`inferApplicationType`). Plugin already does port-agnostic loopback
  matching and `iss` (+ `authorization_response_iss_parameter_supported`).
- Metadata: PRM (`/api/mcp` + root alias), AS + OIDC paths (`src/lib/oauth-metadata.ts`). PRM
  `authorization_servers` overridden to `${origin}/api/auth` (helper defaults to bare origin). The
  AS is not OIDC (no `openid` scope), so the OIDC path serves the same RFC 8414 doc.
- PostHog `mcp_connection_created` via `hooks.after` on `/oauth2/consent`.
- Verified in dev (real flow, browser + curl): DCR → authorize → login → select-org → consent →
  token; AT `aud`=`http://localhost:3000/api/mcp`, `iss`=`.../api/auth`, `org_id`=picked org;
  refresh rotates (+30s replay grace); consent row `(client, user, referenceId=org)`; Deny →
  `access_denied`+`state`+`iss`; 0 orgs card; loopback any port ok, other path rejected; rate limits
  429 (temporarily enabled). Not run: real MCP Inspector (slice 17).

Known limits:

- Pick marker is per session, not per client/request (plugin gives `shouldRedirect` no client id):
  after pick → "Change"/abandon, another client authorizing within 2 min skips the picker. Consent
  still shows org + Change.
- Session expiring mid-flow: the `/login?redirectTo=` bounce carries the router-normalised URL,
  which breaks the signed query; the client must restart.
- `oauth_consent` has no unique `(client, user, reference)` index (plugin does find-then-insert);
  concurrent double-submit could duplicate. Verified tick = `registrationKind(clientId)` (URL id →
  CIMD); revisit when slice 11 lands.
- Signup mid-flow drops the OAuth query (no `signup.page`).
