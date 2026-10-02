# CIMD support

Type: AFK Status: done Blocked by: 10

Spec: [spec.md § Auth stack, OAuth screens](../spec.md)

## What to build

`@better-auth/cimd` with our Workers fetcher: https only; reject own origin + IP-literal hosts; no
redirects; 5s timeout; 64KB cap; JSON `client_id` === URL; KV cache ~1h. AS metadata advertises
`client_id_metadata_document_supported` + `none` auth method. Consent shows verified tick + host for
CIMD clients. `registration: "cimd"` in `mcp_connection_created`.

## Acceptance criteria

- [x] Inspector with URL client_id completes flow; consent shows verified state (see Resolution:
      real Inspector deferred to 17)
- [x] fetcher guard tests: http, IP literal, own origin, redirect, oversize, timeout, id mismatch
- [x] second fetch within TTL served from KV

## Resolution

- Dep `@better-auth/cimd` ^1.7.7, `cimd()` after `mcp()` in `src/lib/auth.ts`,
  `metadataProfile: "mcp-2026-07-28"` (requires `client_name` + `redirect_uris`). AS metadata
  already advertises `client_id_metadata_document_supported` + `none`.
- `src/domain/cimd.ts` (pure guard + constants), `src/lib/cimd-fetch.ts` (Workers fetcher): https
  only; reject IP literals, own host (incl. trailing dot), creds; `redirect: "manual"` + any 3xx
  refused; 5s timeout (covers body); 64KB cap; JSON `client_id` === URL; KV cache ~1h (`cimd:<url>`,
  best effort: KV errors = miss, corrupt entry = miss; hit returns `max-age=<remaining>`).
  Non-client JSON (jwks) passes through uncached.
- Consent host for CIMD = `client_id` host (verified identity), not document `client_uri`.
  `registrationKind` now https-only, same rule as the guard. `mcp_connection_created.registration`
  already derives from it.
- Tests: `cimd.test.ts`, `cimd-fetch.test.ts` (http, IP literal, own origin, redirect, oversize x2,
  timeout x2, id mismatch, KV hit/miss/failure).
- Verified on dev: authorize with `https://claude.ai/oauth/mcp-oauth-client-metadata` fetched the
  real doc, created client (`cimd`, auth `none`), KV entry expiring ~1h. Not run: real MCP Inspector
  (slice 17).

Known limits:

- Plugin hardcodes a 5KB cap on client docs; our 64KB only bites `jwks_uri` fetches.
- Own-origin guard is by hostname; other aliases of the Worker (e.g. `*.workers.dev`) aren't listed.
- KV cache ignores origin `Cache-Control: no-store`.
- Older CIMD clients without `client_name` are rejected by the MCP profile.
