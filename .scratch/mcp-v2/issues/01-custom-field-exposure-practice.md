# Industry practice for exposing tenant-defined fields to LLMs over MCP

Type: research Status: resolved Blocked by:

## Question

How do production MCP servers and LLM tool APIs expose **tenant-defined schema** (custom fields
that differ per org) so the model knows the fields exist and can reason, filter and write against
them? Compare:

- per-request dynamic tool `description` / `inputSchema` / `outputSchema` (our server is built
  per request)
- a dedicated discovery tool (`describe_schema` / `list_custom_fields`)
- MCP resources and prompts
- inlining definitions into every read result (label + type next to the value, including empty
  ones)
- `notifications/tools/list_changed` when definitions change

For each option, cover client support (claude.ai, ChatGPT, Claude Code, Cursor), token cost, and
caching of tool lists by clients. Look at examples such as Salesforce, HubSpot, Notion, Airtable
and Linear MCP servers.


## Answer

Resolved 2026-10-22 (research).

Gist:
- Industry practice (HubSpot, GitHub issue fields, Notion, Airtable, Attio, Salesforce,
  Atlassian): tool schemas stay static. Tenant fields are exposed through discovery tools,
  self-describing results, and generic `[{field, value}]` args resolved server-side. None of them
  put tenant fields in `inputSchema`.
- Client tool-list caching kills dynamic schemas:
  - claude.ai caches the list for ≥1h (users report ~24h), ignores `ttlMs`, and keeps a stale list
    after `list_changed` (issue #45 open).
  - ChatGPT keeps a snapshot until an admin clicks Refresh, shared across the workspace.
  - Cursor ignores `list_changed`.
  - Only Claude Code honours it.
- Changing tool definitions also busts the prompt cache and risks leaking one org's labels to
  another.
- Resources and prompts are attached by the user or app, not pulled by the model (except in Claude
  Code).
- A stateless Workers server can't push `list_changed` anyway.

Recommendation:

1. Keep tool metadata static and org-agnostic (`cacheScope: public`, long TTL). Static server
   instructions say: "custom fields exist; call `whoami`/`list_custom_fields` first; use exact
   ids/labels".
2. Add a `list_custom_fields` tool returning `[{id,label,type}]`, and include the same list in
   `whoami`.
3. `get_profile` returns every definition, with `value: null` when unset.
4. `search_profiles` and the write tools take `customFieldFilters` / `customFields: [{field,
   value}]`, where `field` is an id or a label. The server resolves and coerces it, and errors list
   the valid fields.
5. Skip dynamic schemas, resources, prompts and `list_changed`.

Trade-offs:
- An extra discovery round-trip.
- Validation happens server-side instead of through SDK types.
- The payload grows with the number of definitions. There is no cap today, so it needs a cap or
  projection.

Source caveats: the claude.ai cache figures come from a maintainer comment plus user reports.
Salesforce details come from secondary sources (the official page returned 403). Cursor's behaviour
comes from forum posts.

Open for the design ticket:
- Cap the number of custom field definitions per org?
- Which filter operators per type?
- Accept labels, or ids only?
- Fold the definitions into `whoami`?

Context: branch `research/mcp-custom-field-exposure`, file
`.scratch/mcp-v2/research/custom-field-exposure.md`.
