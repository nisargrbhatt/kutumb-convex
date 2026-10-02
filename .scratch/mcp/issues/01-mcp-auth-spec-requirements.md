# MCP authorization spec requirements

Type: research
Status: resolved
Blocked by:

## Question

What does the current MCP authorization spec require of a remote server acting as both the
resource server and the authorization server, and what do claude.ai, ChatGPT, Claude Code and
Cursor actually rely on? Cover:
- protected-resource metadata (RFC 9728)
- AS metadata (RFC 8414)
- PKCE
- DCR (RFC 7591)
- resource indicators (RFC 8707) and audience binding
- token format expectations
- the `WWW-Authenticate` 401 flow
- CORS

## Answer

Latest spec = MCP **2026-07-28**; vendors still cite 2025-11-25 (auth near-identical).

- **PRM (RFC 9728) MUST**: `resource` = exact MCP URL, `authorization_servers` ≥1. Serve at path-inserted `/.well-known/oauth-protected-resource/mcp` + root; point to it from 401 `resource_metadata`. Claude uses only first AS.
- **AS metadata**: RFC 8414 or OIDC; `issuer` must match URL; `code_challenge_methods_supported:["S256"]` MUST be present or clients abort.
- **PKCE S256** mandatory (Claude, ChatGPT always send).
- **Registration**: CIMD preferred (SHOULD); **DCR deprecated** in 2026-07-28 but still MAY. Claude uses CIMD only if `client_id_metadata_document_supported:true` + `none` in `token_endpoint_auth_methods_supported`, else DCR. ChatGPT prefers CIMD, falls back DCR. Cursor = DCR (CIMD undocumented). → support both.
- **RFC 8707**: clients always send `resource`; bind into token `aud`; RS MUST reject wrong-aud; no passthrough.
- **Token format**: not mandated (JWT or opaque). Bearer header only, never query. Short-lived AT; rotate RT for public clients; `invalid_grant` on bad refresh; token endpoint form-urlencoded, <10s.
- **401/403**: 401 + `WWW-Authenticate: Bearer resource_metadata=…, scope=…` for missing/invalid; 403 `insufficient_scope` for step-up. Claude needs 401 (ignores header on 200).
- **iss (RFC 9207)**: new SHOULD; advertise `authorization_response_iss_parameter_supported`. ChatGPT gives stable redirect only with it.
- **Redirects**: claude.ai `https://claude.ai/api/mcp/auth_callback`; Claude Code loopback any port on `localhost` + `127.0.0.1` (port-agnostic match); ChatGPT `https://chatgpt.com/connector_platform_oauth_redirect`; Cursor `http://localhost:8787/callback` + `https://www.cursor.com/agents/mcp/oauth/callback` (8787 clashes w/ wrangler dev).
- **CORS**: not in spec. Permissive on metadata/token/register for browser clients (SDK does this); `/mcp` MUST validate `Origin`.
- Transport 2026-07-28 is stateless (no initialize/session) — plan back-compat for current clients.

Full findings: branch research/mcp-auth-spec, .scratch/mcp/research/01-mcp-auth-spec-requirements.md
