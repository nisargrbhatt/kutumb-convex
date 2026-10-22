# Research: MCP write-tool practice

Ticket: `.scratch/mcp-v2/issues/02-write-tool-practice.md`. Researched 2026-10-22. Sources are
linked inline. "Inference" marks my reasoning, not a source claim.

## TL;DR

- Annotations are **hints, untrusted**, and clients only key **confirmation** off them.
  `readOnlyHint:false` gets a confirmation prompt in claude.ai, VS Code, and ChatGPT. Nobody uses
  `idempotentHint` or `openWorldHint` for approval. Set all four on every write tool anyway.
- **Elicitation is not a portable confirm step.** claude.ai does not list it as supported. In
  2026-07-28 it is stateless (MRTR, signed `requestState`), and our SDK supports that, but only
  modern-protocol clients that declare it can use it. The host's tool-approval prompt is the only
  human-in-the-loop you can count on.
- **There's no idempotency standard.** The spec only has `idempotentHint`, and no SEP exists. In
  practice: natural keys, a no-op `unchanged` outcome, and an optimistic version (GitHub's `sha`).
- **Optimistic concurrency works when the read tool returns the version and the write tool
  requires it.** GitHub `create_or_update_file` tells the model, in the description, to fetch
  `sha` first. Kutumb's `get_profile` currently **strips `version`**, so it must be exposed.
- **Pending review** has no protocol construct. Return a normal (non-error) result with
  `outcome: "requested"` + id + plain text saying the change isn't live yet. Stripe's approval
  flow and Kutumb's own `SubmitResult` already have this shape.
- **Scope gating.** The spec now explicitly allows `tools/list` to vary by granted scopes. Step-up
  (`403 insufficient_scope`) works in claude.ai, fails without recovery in Claude Code (user
  re-auths by hand), and ChatGPT wants it in tool-result `_meta`. GitHub hides tools for PATs and
  challenges for OAuth. Linear uses a read-only endpoint or scope.

## 1. Spec facts (2026-07-28)

| Topic | What the spec says | Source |
| --- | --- | --- |
| Annotation defaults | `readOnlyHint` default **false**; `destructiveHint` default **true** (only meaningful when not read-only); `idempotentHint` default **false**: "calling the tool repeatedly with the same arguments will have no additional effect"; `openWorldHint` default **true** | [schema.ts `ToolAnnotations`](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2026-07-28/schema.ts) |
| Trust | "Clients should never make tool use decisions based on `ToolAnnotations` received from untrusted servers"; tools page: clients **MUST** treat them as untrusted unless the server is trusted | schema.ts; [Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) |
| Human in loop | "there **SHOULD** always be a human in the loop with the ability to deny tool invocations"; clients SHOULD "Present confirmation prompts ... for operations" and "Show tool inputs to the user before calling the server" | Tools |
| Per-scope tool list | `tools/list` "**MUST NOT** vary per-connection ... The set **MAY** vary by the authorization presented on the request — for example, returning only the tools the caller's granted scopes permit" | Tools § Capabilities |
| List caching | `tools/list` MUST carry `ttlMs` + `cacheScope`; `"private"` for "filtered list results that vary per user"; private caches "**MUST NOT** be shared across authorization contexts (e.g. a different access token requires a different cache)" | [Caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching) |
| Errors | Business/validation errors go in `isError: true` results so the model can self-correct; protocol errors are JSON-RPC errors | Tools § Error Handling |
| Stateful handles | No sessions; carry state as explicit handles in args; "a handle is a name, not a capability", so re-authorize every call | Tools § Stateful Tools |
| Elicitation transport | Server→client requests now **only** via MRTR: the `tools/call` result is `resultType:"input_required"` + `inputRequests` + opaque `requestState`; the client retries with `inputResponses`. Works without shared state | [MRTR](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr) |
| `requestState` | Attacker-controlled; MUST be integrity-protected (HMAC/AEAD) if it affects authz/business logic; SHOULD bind principal + short TTL + request digest; "do not by themselves guarantee single-use", so one-shot semantics are enforced server-side | MRTR § Server Requirements |
| Elicitation rules | Server MUST NOT send modes the client didn't declare; actions `accept`/`decline`/`cancel`; servers MUST handle decline/cancel | [Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) |
| Step-up | Runtime insufficient scope → `403` + `WWW-Authenticate: Bearer error="insufficient_scope", scope="…", resource_metadata="…"`; include **all** scopes needed for the operation in one challenge; clients union with previously requested scopes and re-authorize, with retry limits | [Authorization § Scope Challenge Handling](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) |
| `scopes_supported` | Meant as "the minimal set of scopes necessary for basic functionality", with more requested "incrementally through the step-up authorization flow" | Authorization § Scope Selection Strategy |

SDK (`@modelcontextprotocol/server` 2.2.0, installed) has: `inputRequired(...)`,
`createRequestStateCodec` (HMAC, "protocol revision 2026-07-28"), and a per-tool
`scopeChallenge` / `requireScopes(...)` on `registerTool`. Its push-style `ctx.mcpReq.elicitInput`
is deprecated and "Throws on a 2026-07-28-era request". Legacy (2025) traffic under
`legacy:'stateless'` is served by a fresh instance per request. Source:
`node_modules/@modelcontextprotocol/server/dist/createMcpHandler-*.d.mts`. Inference: legacy-era
push elicitation can't work for us, because the client's answer arrives on a new POST to a new
instance and we run without SSE.

## 2. Annotations: what clients do with them

| Client | Behavior | Source |
| --- | --- | --- |
| claude.ai / Desktop | Directory requires `title` + `readOnlyHint` or `destructiveHint`. "These determine auto-permissions in Claude. Read-only tools can run without per-call confirmation, and destructive tools always prompt." Users set **Always allow / Needs approval / Blocked** per tool or group | [Review criteria](https://claude.com/docs/connectors/building/review-criteria); [Getting started](https://claude.com/docs/connectors/getting-started) |
| Claude Code | Prompts per MCP tool unless an allow rule exists. Docs don't say whether annotations change this. Server can force a prompt every time with `_meta["anthropic/requiresUserInteraction"]: true` (no "don't ask again", even in bypass modes) | [Claude Code MCP](https://code.claude.com/docs/en/mcp) |
| ChatGPT | Submission requires explicit `readOnlyHint`, `destructiveHint`, `openWorldHint` (`annotations_required`). "ChatGPT currently requires manual confirmation in any conversation before write actions can be taken." Hints "only influence how ChatGPT or Codex frames the tool call"; `openWorldHint:false` is right for a "bounded private account or workspace" | [Apps SDK llms-full](https://developers.openai.com/apps-sdk/llms-full.txt); [OpenAI MCP](https://developers.openai.com/api/docs/mcp) |
| VS Code | "VS Code doesn't ask for confirmation to run read-only tools"; confirmation shown for every tool without `readOnlyHint`; user can edit args in the dialog | [VS Code MCP guide](https://code.visualstudio.com/api/extension-guides/ai/mcp) |
| Cursor | Approval by default; allowlisted tools auto-run. Annotations not mentioned | [Cursor MCP](https://cursor.com/docs/context/mcp) |

Real servers:
- **GitHub**: write tools set `ReadOnlyHint:false`. Only delete-type tools set
  `DestructiveHint:true` (e.g. `delete_file`). See [repositories.go](https://github.com/github/github-mcp-server/blob/main/pkg/github/repositories.go) and [issues.go](https://github.com/github/github-mcp-server/blob/main/pkg/github/issues.go).
- **Notion**: delete tools are `destructiveHint:true` and also require the arg
  `user_confirmed: true`. See [Notion supported tools](https://developers.notion.com/docs/mcp-supported-tools).

Kutumb mapping (inference). Every write is to a bounded private org, so `openWorldHint:false`.

| Kind | readOnly | destructive | idempotent |
| --- | --- | --- | --- |
| create, address_add, relation_add | false | false | false |
| info, address_edit | false | **true** | true (with `expectedVersion`) |
| relation_remove, address_remove | false | true | true (repeat → NotFound/no-op) |

Reasoning: info/address_edit overwrite data, and ChatGPT's own rule is "overwriting" →
destructive. Destructive = true keeps the claude.ai prompt on.

## 3. Elicitation per client

| Client | Elicitation | Notes | Source |
| --- | --- | --- | --- |
| claude.ai / Desktop | **Not listed** as supported. Docs list tools/prompts/resources and say unsupported: subscriptions, sampling, "advanced or draft capabilities". Auth follows specs up to 2025-11-25 | Treat as no | [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index) |
| Claude Code | Form + URL. On 2026-07-28 connections it declares `elicitation:{form:{},url:{}}`. An `Elicitation` hook can auto-answer | Auto-answer means it's not proof that a human confirmed | Claude Code MCP |
| ChatGPT | Apps SDK: "Use MCP elicitation when the server needs structured information that was not provided in the original tool call." OpenAI also has a form-elicitation extension | Framed as data collection, not confirmation | Apps SDK llms-full |
| VS Code | Supported ("request input from the user") | — | VS Code MCP guide |
| Cursor | Supported | — | Cursor MCP |

Conclusion (inference): elicitation can't be the confirmation gate. Our main surface (claude.ai)
lacks it, and the host already confirms writes. Use it, if ever, only as progressive enhancement
behind a capability check.

## 4. Client-support matrix

| | claude.ai/Desktop | Claude Code | ChatGPT | VS Code | Cursor |
| --- | --- | --- | --- | --- | --- |
| Confirms non-read-only tools | Yes (destructive always; per-tool settings) | Yes (permission prompt; allow rules) | Yes ("manual confirmation" for writes) | Yes (non-`readOnlyHint`) | Yes (default; allowlist) |
| Auto-runs `readOnlyHint` | Yes | Not documented | Unverified (OpenAI help center blocked fetch) | Yes | Not documented |
| Uses `idempotentHint` / `openWorldHint` | Not documented | Not documented | Review/framing only | No | No |
| Elicitation form | Not listed | Yes | Yes (docs) | Yes | Yes |
| Elicitation URL | Not listed | Yes | Unclear | Unclear | Unclear |
| 2026-07-28 / MRTR | Not stated (auth ≤2025-11-25) | Yes | Unclear | Unclear | Unclear |
| `403 insufficient_scope` step-up | **Yes**: prompts re-auth, retries the call | Fails with "needs additional permissions"; user re-auths via `/mcp`; pinned `oauth.scopes` override the challenge | Via tool-result `_meta["mcp/www_authenticate"]` + per-tool `securitySchemes`; reauth "including to request additional OAuth scopes" | Not documented | Not documented |
| Force prompt every call | — | `_meta["anthropic/requiresUserInteraction"]` | — | — | — |

Sources: rows above, plus [Claude lazy auth § Ask for more scope with 403](https://claude.com/docs/connectors/building/lazy-authentication).
claude.ai caveats: it requests the union of the 403 `scope` and the discovery scope. "List every
scope the user still needs alongside the newly required ones." Any 403 without
`insufficient_scope` is terminal. `isError` text never triggers auth.

## 5. Idempotency and retry safety (stateless)

- **Spec.** Only `idempotentHint`. There's no idempotency-key field and no SEP in the
  [SEP index](https://modelcontextprotocol.io/seps/index.md). MRTR `requestState` is explicitly
  *not* single-use.
- **Duplicate risk comes from the model, not the transport.** It re-calls after a timeout or an
  ambiguous result, or in a later turn. A key the LLM generates as a tool arg tends to be
  regenerated per attempt, which defeats it (Stripe's guidance on keys: "an ID regenerated per
  attempt defeats it", [stripe/ai metronome skill](https://github.com/stripe/ai)). Inference: an
  LLM-supplied idempotency key adds little.
- **Patterns that work without sessions:**
  1. **Optimistic version on updates.** A repeat of a successful `info` call carries an old
     `expectedVersion` → `Stale`. Make it safe: on `Stale`, if the stored row already equals the
     requested values, return `unchanged`. Kutumb `SubmitResult` already has `unchanged`.
  2. **Natural-key guards on adds.** Relations already reject a duplicate pair (`Invalid`,
     "Relationship already exists"). Add the same for addresses (normalized line1+postalCode on
     the same profile).
  3. **Removes:** a repeat yields NotFound. Phrase that as "already removed", not as a failure.
  4. **Create:** see §9.
- **Stripe** confirms high-risk writes out of band: an approval URL, then an approval token on
  retry that expires in 24h ([Stripe MCP](https://docs.stripe.com/mcp)). That's a server-side
  single-use token, the same thing MRTR says you must enforce yourself.

## 6. Dry-run / preview patterns

| Pattern | Who | Fit for Kutumb |
| --- | --- | --- |
| Host confirmation shows args | All clients (spec SHOULD) | Baseline. Make args human-readable (names, not just ids) |
| Model-set confirm flag (`user_confirmed: true`) | Notion deletes | Weak, since the model can set it. Not needed: no deletes in scope |
| Out-of-band approval URL + token | Stripe refunds/payouts | Overkill. Members already get human review via Change Requests |
| MRTR elicitation "confirm?" form | Spec | Only Claude Code/VS Code/Cursor. Skip v1 |
| "Show plan before writing" in prompts | Linear docs' example prompts ([Linear MCP](https://linear.app/docs/mcp)) | Put in server `instructions`, not enforced |
| Separate `preview_*` tool / `dryRun` arg | None of the surveyed servers | Optional. `submit` already plans before batching, so `dryRun` could return the diff without commit. Low priority |

## 7. Optimistic concurrency with an LLM

- Precedent: GitHub `create_or_update_file`. "SHA MUST be provided for existing file updates. To
  obtain the current blob SHA before updating, call the get_file_contents tool…". The arg is
  required for updates and its description names the read tool.
- Kutumb today: `get_profile` drops `version` for profile and addresses
  (`src/server/mcp/tools/getProfile.ts:78-93`). Writes need it returned (as `version`) and
  required on `info` / `address_edit`.
- `info` takes a **full** `CommunityProfileInput`. Inference: an LLM sending the whole profile will
  clobber fields it didn't read or mis-copied. Better: the MCP tool takes a **partial patch** +
  `expectedVersion`, and the server merges onto the row at that version before `submit`.
- On `Stale`: return `isError:true` with actionable text. The record changed, call `get_profile`
  again, reapply, and retry with the new version. Spec: execution errors exist so the model can
  "self-correct and retry". Claude reviewers fail generic errors.

## 8. "Accepted but pending review" results

- No protocol construct. Tasks / `input_required` don't fit a review that takes days. Inference.
- Return success (`isError` absent) with `structuredContent`
  `{ outcome: "applied" | "requested" | "unchanged", profileId, changeRequestId? }`. Text should
  say, for example: "Submitted for review as Change Request X. Not visible until an
  owner/admin approves." A pending result is not a failure, so flagging it as an error would
  push the model to retry.
- Stripe is the analogue: a write returns "needs human approval", and the user acts out of band.
- Read-your-writes (map decision): for `requested`, the AI Client's next `get_profile` will show
  the old values. Inference: surface the caller's own pending Change Requests on read, or the
  model will think the write failed and resubmit.

## 9. Duplicate-create detection for LLM inserts

None of the surveyed servers documents create-dedupe. Notion and Linear docs are silent. Options
(inference, ranked):
1. **Pre-insert match check in `create`**: same org, normalized full name + DOB (or + mobile/email
   if given). On a hit, return a non-error result with `outcome: "possible_duplicate"`, the
   candidate ids, and a short summary. Model or user then decides. Proceed only with an explicit
   `allowDuplicate: true` (or `confirmNotDuplicate`) arg. Host confirmation shows that flag.
2. **Description nudge**: "call `search_profiles` first to check the person isn't already
   listed". Cheap, not enforced.
3. **Window dedupe**: identical create payload from the same Connection within N minutes →
   return the earlier result. This covers model retry after a timeout. KV or D1 keyed by
   payload hash + `clientId:userId`. Hashing cost is trivial here.
4. Member-created drafts already go through Change Request review. Reviewers are a backstop, not
   a substitute.

## 10. Scope gating: hide vs `insufficient_scope` vs step-up

| Approach | Who | Pros | Cons |
| --- | --- | --- | --- |
| **Hide** write tools without `community:write` | Spec-sanctioned; GitHub (classic PAT); Linear `/mcp/readonly` or `read` scope | Deterministic, works on every client, model never tries. Matches "opt-in, existing Connections stay read-only" | Model can't offer writing. Need `cacheScope:"private"` on `tools/list`. Upgrade = reconnect |
| **List + 403 step-up** per tool | GitHub remote OAuth ("you're prompted to authorize it"); claude.ai supported | Smooth in-context upgrade on claude.ai | Claude Code: hard fail + manual `/mcp`; ChatGPT needs a different (`_meta`) signal; needs a per-tool challenge (SDK `scopeChallenge`; current `verify.ts` gate is global); AS must support incremental consent |
| **List + `isError` text** "reconnect with write" | Atlassian admin-blocked tools return "Access denied…" ([Atlassian](https://support.atlassian.com/security-and-access-policies/docs/configure-atlassian-mcp-server-permissions/)) | Simple | Model sees unusable tools; no auth UI triggered anywhere |

Notes:
- Scope ≠ role. A member with `community:write` still writes only via Change Requests. The tool
  set can stay the same for all roles. Descriptions can be per-Actor, since `buildMcpServer` runs
  per request.
- 403 must be a transport response. claude.ai: only a `401`, or a `403` with `insufficient_scope`,
  starts auth. A `200`/`isError` never does.

## Recommendations

1. **Annotations**: set all four on every tool, plus `title`. Writes: `readOnlyHint:false`,
   `openWorldHint:false`, `destructiveHint` true for info/address_edit/*_remove and false for
   create/*_add, `idempotentHint` true only for version-guarded edits and removes. Add a
   `defineWriteTool` next to `defineReadTool`.
2. **Confirmation** = host tool-approval prompt. Don't depend on elicitation (absent on claude.ai).
   Don't add model-settable confirm flags, except `allowDuplicate` on create. Optionally mark
   owner/admin-direct destructive tools with `_meta["anthropic/requiresUserInteraction"]`. That
   decision belongs to ticket 05.
3. **Concurrency**: expose `version` (profile + address) in `get_profile`. Require
   `expectedVersion` on info/address_edit, and name `get_profile` in the arg description (the
   GitHub `sha` pattern). Make `info` a partial patch merged server-side. `Stale` → actionable
   `isError` text.
4. **Idempotency**: no key param. Use version guards, `unchanged` on equal-content repeats, a
   natural-key guard on address_add (relations already have one), and "already removed" on
   repeat removes. Add a short same-payload window dedupe for `create` (and address_add) per
   Connection.
5. **Duplicate create**: pre-insert match (name+DOB/contact) → `possible_duplicate` result with
   candidates. Override via `allowDuplicate:true`. Add a description nudge to search first.
6. **Pending**: success result with `outcome:"requested"` + `changeRequestId` + explicit "not live
   until approved" text. Never `isError`. Show the caller's own pending requests on reads.
7. **Scope gating v1: hide.** Without `community:write`, don't register write tools. Set
   `tools/list` `cacheScope:"private"`. Have `whoami` return granted scopes / `canWrite` + how to
   enable, so the model can explain. Keep the global 403 gate for `community:read`. **Defer
   403 step-up** to the migration/consent work. If adopted later, use SDK per-tool
   `scopeChallenge` (challenge `community:read community:write` together) and mirror it in
   tool-result `_meta["mcp/www_authenticate"]` for ChatGPT.
8. **Errors**: map `Stale`/`Conflict`/`Invalid`/`LimitReached` to specific user-safe `isError`
   text. Today `toolErrorResult` collapses them to "Internal error", which fails Claude review
   and blocks self-correction.

## Open questions

- Does better-auth `@better-auth/mcp` support incremental consent (add scope to an existing
  grant)? This gates step-up.
- Does SDK `scopeChallenge` fire on the `legacy:'stateless'` (2025) path? claude.ai likely uses it.
  Needs a test.
- What dup-match key fits Kutumb's data (name+DOB vs name+father)? The domain must decide.
- Should `requiresUserInteraction` be set on direct (owner/admin) destructive writes?
- ChatGPT behavior on a transport `403 insufficient_scope` (vs `_meta`) is unverified.
