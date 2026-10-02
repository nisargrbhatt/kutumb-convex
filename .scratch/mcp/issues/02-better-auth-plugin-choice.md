# better-auth plugin options for MCP OAuth

Type: research
Status: resolved
Blocked by:

## Question

In better-auth v1.6.x, which plugin should back MCP OAuth? Candidates: `mcp`,
`oauth-provider`/`oidc-provider`, Agent-Auth (https://better-auth.com/docs/plugins/agent-auth).
For each, cover:
- maintenance status
- spec compliance vs ticket 01
- DCR support
- the tables it adds (Drizzle/D1)
- whether it works with `better-auth/minimal` on CF Workers
- whether the consent screen is customisable, so an org can be picked and stored on the grant
- how to look up and revoke grants per user
- how a resource route verifies a token and reads user + org

## Answer

- **Recommend `@better-auth/oauth-provider@1.6.29`** (pin = core) + `jwt()` plugin. If core
  upgraded to 1.7.x, swap to `@better-auth/mcp` (wraps oauth-provider, same options + `resource`,
  built-in RFC 9728 + `requireMcpAuth` + DPoP/CIMD); only published for `^1.7.6`.
- Core `mcp` plugin = wrapper over deprecated `oidc-provider`; both **removed in 1.7.0**; no RFC
  8707, opaque tokens, consent only on `prompt=consent`, no org hook. Reject.
- Agent-Auth: own protocol, not OAuth/MCP-auth, "not yet stable". Reject.
- oauth-provider spec: PKCE enforced (public clients); DCR `/oauth2/register` needs
  `allowDynamicClientRegistration` + `allowUnauthenticatedClientRegistration`; AS metadata +
  `oauthProviderAuthServerMetadata` helper for root `/.well-known`; RFC 8707 `resource` checked vs
  `validAudiences` → JWT access token w/ `aud`; PRM JSON via
  `oauthProviderResourceClient(auth).getProtectedResourceMetadata` (we mount route).
- Tables: `oauthClient`, `oauthRefreshToken`, `oauthAccessToken`, `oauthConsent` (all w/
  `referenceId`) + `jwks`. Arrays → JSON text on sqlite; D1 fine. Imports only better-auth
  subpaths + jose/zod → OK w/ `better-auth/minimal` on Workers (not runtime-tested).
- Org on grant: `postLogin { page, shouldRedirect, consentReferenceId }` → own select-org page,
  set active org, `/oauth2/continue {postLogin:true}` → `referenceId = activeOrganizationId` on
  consent/code/refresh; `customAccessTokenClaims({referenceId})` → org claim in JWT. Custom
  `loginPage`/`consentPage` (own routes, `POST /oauth2/consent`).
- Grants: `/oauth2/get-consents`, `update-consent`, `delete-consent` (user-scoped). Gap:
  delete-consent doesn't revoke refresh tokens → custom "disconnect" server fn must also mark
  `oauthRefreshToken.revoked`; JWT access tokens live till exp → short `accessTokenExpiresIn`.
- Resource verify: `mcpHandler({jwksUrl, verifyOptions:{audience, issuer}}, (req, jwt) => …)` →
  `jwt.sub` = user id, custom claim = org id; re-check membership server-side.
- Full findings: branch `research/better-auth-mcp-plugin`,
  `.scratch/mcp/research/02-better-auth-plugin-choice.md`
