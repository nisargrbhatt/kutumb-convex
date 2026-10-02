# OAuth provider + DCR flow

Type: AFK
Status: open
Blocked by: 09

Spec: [spec.md § Auth stack, OAuth screens, Rate limits](../spec.md)

## What to build

Add `@better-auth/mcp` + `jwt()`; DCR flags on; scopes `community:read` + `offline_access`; AT 1h,
RT 30d rotating; `customAccessTokenClaims` emits org (`referenceId`); `iss` param; loopback
port-agnostic redirects. Drizzle migration for oauth tables + `jwks`. Root `.well-known` routes
(PRM + AS + OIDC metadata, ACAO `*`). Routes `/oauth/select-org` + `/oauth/consent` per prototype
(`prototype/mcp-ai-settings` @ d92e229), DCR → red "Unverified app". OAuth `customRules`. PostHog
`mcp_connection_created`.

## Acceptance criteria

- [ ] MCP Inspector completes DCR + auth code + PKCE; JWT `aud` = `${origin}/api/mcp`, org claim set
- [ ] select-org: active preselected, setActive called; 0 orgs → create-community card
- [ ] consent Allow → `oauthConsent(clientId, userId, referenceId=orgId)`; Deny → error to client
- [ ] metadata routes match spec; `code_challenge_methods_supported: ["S256"]`
- [ ] register 5/h/IP, token + authorize 30/min enforced
- [ ] screens responsive, breadcrumb-free auth card, accessible
