# Lock: server seam

Status: ready-for-agent Blocked by: 14

## What to build

`orgMiddleware` joins `orgBilling`, throws `AppError("Locked", lockReason)`;
`orgMiddlewareAllowLocked` variant. better-auth hooks block invite / rename / role change (except
owner transfer) under Lock. MCP tool calls → `OrgLocked` error text. Blob GET/PUT 403. OAuth
select-org disables locked orgs; `pickOauthOrgFn` refuses.

## Spec

[spec.md](../spec.md): Lock enforcement.

## Done when

- [ ] Zero extra D1 round trips in `orgMiddleware`.
- [ ] Locked org: every non-exempt server fn throws `Locked`; exempt list still works.
- [ ] MCP on locked org: `tools/list` OK, tool call `isError` with spec text; no 401.
- [ ] Paying (row → active) unlocks on the very next request.
