# Research: exposing tenant-defined fields (Custom Field Definitions) to LLMs over MCP

Ticket: `.scratch/mcp-v2/issues/01-custom-field-exposure-practice.md`. Researched 2026-10-22.

## TL;DR

Industry practice = **static, org-agnostic tool schemas + a discovery tool + self-describing
results + generic `[{field, value}]` filter/write args resolved server-side**. Nobody surveyed
bakes tenant fields into `inputSchema`/descriptions. Client tool-list caching (claude.ai ≥1h and
buggy, ChatGPT manual-refresh snapshot, Cursor ignores `list_changed`) makes per-org dynamic
schemas unreliable, prompt-cache hostile, and a cross-tenant leak risk.

## Kutumb starting point (code)

- `buildMcpServer()` (`src/server/mcp/server.ts`) takes no args today. SDK v2.2.0 factory gets
  `McpRequestContext { era, authInfo, requestInfo }` and may be async, so per-Actor/org tool
  registration is technically possible (`node_modules/@modelcontextprotocol/server/dist/createMcpHandler-*.d.mts`,
  `McpServerFactory`). Actor is in `authInfo.extra.actor` (`src/server/mcp/endpoint.ts`).
- SDK supports per-registration `cacheHint {ttlMs, cacheScope}` and server-level `cacheHints` for
  `tools/list` etc. (same d.mts, `CacheHint`, `CACHEABLE_RESULT_METHODS`). Only emitted on 2026-07-28 wire.
- `get_profile` drops empty custom fields (`toProfileView`, `src/server/mcp/tools/getProfile.ts`);
  `search_profiles` filters only name/gender (`searchProfilesInput`, `src/domain/communityProfile.ts`).
- No cap on number of definitions per org (no limit in `src/lib/limits.ts`).

## Spec facts

| Fact | Source |
| --- | --- |
| `tools/list` "MUST NOT vary per-connection"; "MAY vary by the authorization presented on the request" | [2026-07-28 tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) |
| Servers SHOULD return tools in deterministic order "to enable client-side caching and improve LLM prompt cache hit rates" | same; [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog) minor #3 |
| `tools/list` MUST carry `ttlMs` + `cacheScope`; `private` = per auth context, "MUST NOT be shared across authorization contexts"; `public` = may be served to any user | [2026-07-28 caching](https://modelcontextprotocol.io/specification/2026-07-28/server/utilities/caching), SEP-2549 |
| `list_changed` in 2026-07-28 only reaches clients holding a `subscriptions/listen` long-lived stream | 2026-07-28 tools; changelog major #4 (SEP-2575) |
| Sessions removed; list endpoints cacheable at `(deployment, auth)` granularity; maintainer: "You can still filter based on auth" | [SEP-2567 PR](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2567) |
| `outputSchema`/`inputSchema` any JSON Schema 2020-12; `structuredContent` any JSON | changelog minor #10 (SEP-2106) |
| 2025-11-25: `listChanged` capability; server SHOULD send `notifications/tools/list_changed` | [2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) |
| Resources are "application-driven" (host decides inclusion); prompts are user-invoked | [2025-11-25 resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources) |

Implication for us: we run `legacy: 'stateless'` (one fresh server per request, no GET stream, no
session) on Workers. We have no channel to push `list_changed` on the 2025 wire, and on 2026 we'd
need a long-lived `subscriptions/listen` stream + fan-out (Durable Object) on definition edits.

## Client behaviour

| Client | Tool-list caching / refresh | `list_changed` | Resources / prompts | Source |
| --- | --- | --- | --- | --- |
| claude.ai (web/desktop/mobile connectors) | Maintainer (Feb 2026): "we cache the list for 1h". Users report staleness 15–24h, surviving reconnect/re-add; stale cached `outputSchema` broke valid results (Oct 2026); server `ttlMs` reportedly ignored; one report says cache keyed per connector URL | Notification received + `tools/list` called, but stale list still used; issue open, `known-issue`, `backlog` | Supports tools, prompts, resources; resources/prompts are user-attached, not model-pulled | [claude-ai-mcp#45](https://github.com/anthropics/claude-ai-mcp/issues/45), [#137](https://github.com/anthropics/claude-ai-mcp/issues/137), [support 11175166](https://support.claude.com/en/articles/11175166) |
| Claude Code | Interactive: refetches on `list_changed`; `-p`/SDK refresh tool list only; keeps old list if refresh fails. Tool search on by default: only tool names + server instructions load upfront; instructions/upfront descriptions cut at 4,096 chars | Yes | Resources via `@` mention + auto list/read tools (model can read); prompts → slash commands | [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) |
| ChatGPT (dev mode / apps) | Metadata is a snapshot: after changing "tool names, descriptions, schemas…" you must click **Refresh**; workspace admins refresh custom apps; published apps via review. Tool list fetched by whoever refreshes, not per end-user | Not documented | Resources only as UI templates/skills; prompts not mentioned. `_meta` hidden from model; `structuredContent` visible | [connect-chatgpt](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt), [build mcp-server](https://developers.openai.com/apps-sdk/build/mcp-server) |
| Cursor | Reconnect (edit `mcp.json`) to refresh | Ignored mid-session (forum, May 2026; no staff reply); staff earlier said listChanged not fully supported | Docs list tools, prompts, resources, roots, elicitation as supported | [cursor docs](https://cursor.com/docs/context/mcp), [forum 161459](https://forum.cursor.com/t/mcp-notifications-tools-list-changed-not-acted-on-mid-session/161459), [forum 147888](https://forum.cursor.com/t/doubts-regarding-the-capabalities-negotiations/147888) |

Prompt caching: "Modifying tool definitions (names, descriptions, parameters) invalidates the
entire cache" (tools → system → messages)
([Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)).

## What real servers do

| Server | Pattern | Source |
| --- | --- | --- |
| HubSpot (remote) | Static tools. Discovery: `discover_hubspot_schema`, `search_properties` (keyword, ≤5), `get_properties` (types + enum values; "fetch specific properties by name" since responses large). Docs: confirm property names before querying/writing. Generic `search_crm_objects` filter groups. Plus `tool_guidance` tool | [HubSpot remote MCP docs](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server.md) |
| GitHub (org-defined issue fields) | Static tools. `list_issue_fields` discovery; `list_issues.field_filters: [{field_name, value}]` — "server looks up the field and coerces the value to its type"; `issue_write.issue_fields: [{field_name, value \| field_option_name \| delete}]`. Server instructions: "Call list_project_fields first… Use EXACT returned field names… Don't invent names or IDs" | [README](https://github.com/github/github-mcp-server/blob/main/README.md), [toolset_instructions.go](https://github.com/github/github-mcp-server/blob/main/pkg/github/toolset_instructions.go) |
| Notion | No separate schema tool: `notion-fetch` on a data source returns "its schema and properties"; query results keyed by property names; multi-source query says "Fetch each data source first… to get its schema"; writes echo the actual keys saved | [Notion MCP tools](https://developers.notion.com/docs/mcp-supported-tools) |
| Airtable | `list_tables_for_base` ("table schema for every table"), `get_table_schema` (fields: names, IDs, types, options; narrowable by field IDs) | [Airtable MCP tools](https://airtable.com/developers/agents/mcp/tools) |
| Attio | `list-objects`, `list-attribute-definitions` ("including their types and valid options"), per-list/activity variants | [Attio MCP](https://docs.attio.com/mcp/overview) |
| Salesforce hosted | `getObjectSchema`: no args → index of objects; with names → field detail + admin guidance. (Official ref page 403'd; secondary sources only) | [servers reference](https://developer.salesforce.com/docs/platform/hosted-mcp-servers/references/reference/servers-reference.html), [secondary](https://www.truefoundry.com/blog/salesforce-mcp-server) |
| Atlassian Rovo | `getJiraIssueTypeMetaWithFields`: field metadata per project + issue type for creating items | [supported tools](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/supported-tools/) |
| Linear | No tenant custom fields; docs name no tools. Not a useful precedent | [Linear MCP](https://linear.app/docs/mcp) |

None found put tenant fields into tool `inputSchema` or descriptions. claude.ai issue #137 thread:
a dev worked around stale caching with meta-tools + a `tools_hash` — i.e. moving dynamic schema
out of `tools/list`.

## Options compared

Token cost: tool defs ride every model request (unless client tool-search defers them); tool
results cost once per call.

### 1. Per-request dynamic tool `description` / `inputSchema` / `outputSchema`

- How: factory reads `authInfo.extra.actor.organizationId`, loads defs, registers e.g.
  `customFieldFilters` with per-org enum of labels, typed props in `outputSchema`.
- Pros: model sees fields with zero calls; typed args validated by SDK.
- Cons:
  - Stale on claude.ai (≥1h, reportedly ~24h, `ttlMs` ignored; stale `outputSchema` caused
    client-side validation failures — direct risk since we emit `outputSchema`). ChatGPT: frozen
    until manual Refresh; refresher's org schema applies to everyone on that app. Cursor: until
    reconnect.
  - Cross-tenant leak: field labels (org data) in tool metadata. Must be `cacheScope: private`;
    clients that cache per URL (reported claude.ai) or per workspace (ChatGPT) can show org A's
    labels to org B users.
  - Every def edit invalidates prompt cache; tokens paid every turn; claude.ai/ChatGPT may also
    trip on schema changes mid-conversation.
  - Extra D1/KV read on every MCP request incl. `tools/list`.
- Verdict: reject.

### 2. Discovery tool (`list_custom_fields` / `describe_schema`)

- Static definition; result private, always fresh (tool calls are never cached by spec).
- Works in every client (plain tool). Cost paid only when called; tiny for us (defs ≈ id+label+type).
- Risk: model may not call it → mitigate with tool descriptions + server instructions ("call first";
  "use exact labels"), and by folding defs into `whoami` and read results (option 4).
- Precedent: HubSpot, GitHub, Airtable, Attio, Salesforce, Atlassian.
- Verdict: adopt.

### 3. MCP resources / prompts

- Resource `kutumb://org/custom-fields`: application-driven; claude.ai/Cursor users must attach;
  ChatGPT doesn't surface non-UI resources to model; only Claude Code auto-exposes list/read tools.
  `resources/read` would be cacheable (TTL) → staleness again.
- Prompts: user-invoked only (slash commands). Can't make the model aware unprompted.
- Verdict: optional extra later (cheap mirror of the discovery tool), not the mechanism.

### 4. Inline definitions in read results (label + type next to value, empties included)

- `get_profile.customFields`: return every def `{id, label, type, value|null}` instead of only
  set ones → model sees which fields exist and that a value is missing vs. unknown. Notion/Airtable
  results are self-describing likewise.
- Cost per profile ≈ N defs × ~15–20 tokens; fine for small N. No def cap exists → add a cap or a
  projection/`fields` arg if orgs grow many defs (feeds map item "Read response budgets").
- `search_profiles` items: don't inline all defs (×100 rows); optionally echo matched filter
  fields only.
- Static `outputSchema` stays valid (array of `{id,label,type,value}`), so no schema churn.
- Verdict: adopt for `get_profile`; add defs to `whoami` output (first call most clients make).

### 5. `notifications/tools/list_changed` on def change

- Our stateless legacy transport can't push; 2026 push needs `subscriptions/listen` streams
  (Workers + DO fan-out). claude.ai ignores the refetched list (#45), Cursor ignores the
  notification, ChatGPT undocumented. Only Claude Code honours it.
- Only matters if option 1 chosen. With static schemas, there's nothing to notify.
- Verdict: skip. Declare `tools.listChanged: false`; set `cacheScope: public` + long `ttlMs` on
  `tools/list` once schemas are org-agnostic (SDK `cacheHints`).

## Recommendation

1. **Keep all tool metadata static and org-agnostic** (`public`, long TTL, deterministic order).
   Server `instructions` (static): community has org-defined custom fields; call `whoami` or
   `list_custom_fields` first; use exact returned ids/labels; never invent fields.
2. **Add `list_custom_fields`** (readOnly): `[{id, label, type}]`, ordered as in app. Also embed
   the same list in `whoami` output.
3. **`get_profile` returns all defs**, `value: null` when unset (`customFields` description:
   "every Custom Field Definition in this community; null = no value").
4. **`search_profiles` gains generic `customFieldFilters: [{field, op?, value}]`** — `field`
   accepts def id or label (case-insensitive); server resolves + coerces per type (GitHub
   `field_filters` pattern); unknown field/bad value → `isError` text listing valid fields/types
   so model self-corrects (spec: execution errors are for self-correction).
5. **Write tools reuse the shape**: `customFields: [{field, value|null}]`, validated against
   current defs inside `makeProfileChanges`; same self-correcting errors. Canonical key = def id
   (GLOSSARY: labels change), label accepted as convenience; results return both.
6. Skip resources/prompts/`list_changed` for now.

### Trade-offs

- (+) Works identically on claude.ai, ChatGPT, Claude Code, Cursor despite their caching bugs;
  no cross-tenant leakage via tool metadata; prompt cache stable; no DO/push infra.
- (−) Extra round-trip (discovery) when model needs fields before filtering — softened by
  `whoami` + `get_profile` carrying defs.
- (−) No SDK-level typed validation of custom values; server must validate/coerce (it must
  anyway — spec "MUST validate all tool inputs").
- (−) Label-based addressing ambiguous if two defs share a label → reject ambiguous, require id.
- (−) Payload grows with def count; needs cap/projection decision.

## Open questions

- Cap on defs per org (affects inline cost)?
- Filter ops per type (eq only vs range for number/date, `isEmpty`)?
- Accept labels or ids only?
- Fold defs into `whoami` or keep it lean?

## Source-quality notes

- claude.ai cache numbers: one maintainer comment (1h, Feb 2026) + user reports (15–24h); not
  official docs. Behaviour may change.
- Salesforce: official reference returned 403; tool details from secondary blogs.
- Cursor: forum posts, no current staff statement found.
