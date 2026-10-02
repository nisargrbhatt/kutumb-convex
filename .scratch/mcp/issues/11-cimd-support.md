# CIMD support

Type: AFK
Status: open
Blocked by: 10

Spec: [spec.md § Auth stack, OAuth screens](../spec.md)

## What to build

`@better-auth/cimd` with our Workers fetcher: https only; reject own origin + IP-literal hosts; no
redirects; 5s timeout; 64KB cap; JSON `client_id` === URL; KV cache ~1h. AS metadata advertises
`client_id_metadata_document_supported` + `none` auth method. Consent shows verified tick + host for
CIMD clients. `registration: "cimd"` in `mcp_connection_created`.

## Acceptance criteria

- [ ] Inspector with URL client_id completes flow; consent shows verified state
- [ ] fetcher guard tests: http, IP literal, own origin, redirect, oversize, timeout, id mismatch
- [ ] second fetch within TTL served from KV
