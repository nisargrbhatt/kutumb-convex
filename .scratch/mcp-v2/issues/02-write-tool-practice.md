# MCP write-tool practice

Type: research Status: resolved Blocked by:

## Question

What do the MCP spec (2026-07-28) and real servers do for **mutating tools**?

- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) and
  how each client acts on them (confirmation prompts, auto-approve).
- Elicitation support per client for human confirmation.
- Idempotency keys and retry safety in a stateless server.
- Dry-run/preview patterns.
- Optimistic concurrency, i.e. how an LLM is expected to carry a `version`.
- Reporting "accepted but pending review" results.
- Scope-gating write tools: hide the tools vs return `insufficient_scope`, and step-up auth
  (`WWW-Authenticate` scope upgrade).

Also cover duplicate-create detection patterns for LLM-driven inserts.


## Answer

Resolved 2026-10-22 (research).

Gist:
- Annotations are untrusted hints. Clients act only on read-only vs write, so the host approval
  prompt is the only portable confirmation.
- Elicitation is not available on claude.ai.
- There is no idempotency standard, so use versions + natural keys.
- Hide write tools when `community:write` is absent. Defer 403 step-up.

Key facts:
- Spec 2026-07-28:
  - `tools/list` MAY vary by granted scopes, and needs `cacheScope:"private"` when it does.
  - Elicitation now runs only via stateless MRTR (`input_required` + signed `requestState`), which
    SDK 2.2.0 supports.
  - Step-up = `403 insufficient_scope` naming every needed scope.
- Client behaviour:
  - claude.ai: read-only tools auto-run, destructive ones always prompt, no elicitation, 403
    step-up works.
  - Claude Code: 403 is a hard fail; the user re-auths via `/mcp`.
  - ChatGPT: confirms all writes; step-up via tool-result `_meta["mcp/www_authenticate"]`.
  - VS Code: skips confirmation only for `readOnlyHint`.
- Precedents:
  - GitHub: requires `sha` on updates (fetched via the read tool); hides tools for PATs, challenges
    for OAuth.
  - Linear: read-only endpoint/scope.
  - Notion: `user_confirmed` flag.
  - Stripe: out-of-band approval URL + token.

Recommendations:
1. `defineWriteTool`: `readOnlyHint:false`, `openWorldHint:false`, `destructiveHint` true for
   info/address_edit/removes, `idempotentHint` true only for version-guarded edits/removes.
2. Confirmation = the host prompt. No dependency on elicitation.
3. Expose `version` in `get_profile` (stripped today). Require `expectedVersion` on
   info/address_edit. Make `info` a partial patch merged server-side. Map `Stale` to an actionable
   `isError`.
4. No idempotency-key param. Instead:
   - version guards
   - `unchanged` on equal repeats
   - a natural-key guard on address_add
   - a short same-payload dedupe window for create, per Connection
5. Duplicate create: a name+DOB/contact match returns `possible_duplicate` + candidates. Override
   with `allowDuplicate:true`.
6. Pending writes return success with `outcome:"requested"` + `changeRequestId` + "not live until
   approved". Never `isError`. Show the caller's own pending requests on reads.
7. Scope gating v1: hide write tools when the scope is absent. `whoami` reports `canWrite` + how to
   enable it. Step-up is deferred to the Connection migration work (SDK per-tool `scopeChallenge` +
   a ChatGPT `_meta` mirror).
8. Map `Stale`/`Conflict`/`Invalid`/`LimitReached` to specific `isError` text. Verified: today
   `toolErrorResult` (`src/server/mcp/errors.ts`) passes through only NotFound/Forbidden; everything
   else becomes "Internal error".

Unverified:
- ChatGPT's handling of a transport-level 403.
- Whether `scopeChallenge` fires on the `legacy:'stateless'` path.
- An OpenAI help article on confirmation settings (fetch returned 403).

Open:
- Does better-auth support incremental consent?
- Does SDK `scopeChallenge` work on the legacy path?
- What is the duplicate-match key?
- `requiresUserInteraction` on direct destructive writes?

Context: branch `research/mcp-write-tool-practice`, file
`.scratch/mcp-v2/research/write-tool-practice.md` (full sources, client matrix).
