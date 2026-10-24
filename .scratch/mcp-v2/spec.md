# Spec: MCP v2 — custom fields, aggregate reads, write tools, caching

Status: ready for implementation (2026-10-24). Map: [map.md](map.md). Slices: `issues/12`–`22`.

## Problem

AI Clients see only core profile fields: no tool lists Custom Field Definitions, `get_profile` shows
only set values, and search can't filter on them. Counting questions ("how many O+ in Pune?") force
the model to page every profile. MCP is read-only, so a member can't ask their AI Client to fix a
relative's details. The graph cache is KV delete-on-write: racy, and it can't promise an AI Client
sees its own write on the next read.

## Solution

Custom Field Definitions become discoverable (`whoami`, `list_custom_fields`) and fully present in
`get_profile`, with typed filters. A shared filter object powers `search_profiles` and a new
`count_profiles` with one `groupBy`. A new opt-in `community:write` scope enables 7 single-item
write tools that go through `makeProfileChanges`, so owner/admin writes apply directly and member
writes become Change Requests, exactly as in the app. Writes are attributed to the AI Client,
throttled per Connection, and can be turned off by the member (read only) or the owner (whole org).
The graph cache moves to a per-org D1 version with immutable keys: zero staleness for everyone.

Terms (`GLOSSARY.md`): **Actor**, **Connection** (write, read only, AI Client writes, write quota),
**AI Client**, **Community Profile** (deceased ≠ `inactive`), **Userless Profile**, **Change
Request** (pending request limit), **Audit Event** (attributed), **Custom Field Definition**
(unique label), **Custom Field Value**, **Member limit**. ADRs: 0001 relation direction, 0003
limits, 0004 Connection = consent row, 0005 audit retention, **0006** write gating, **0007**
attribution + quotas, **0008** graph cache versioning.

## User stories

**Member using an AI Client**

- Ask "what fields does our community track?" → AI calls `list_custom_fields` / `whoami`.
- Ask "who in Pune has blood group O+ and is a volunteer?" → `search_profiles` with core + custom
  filters; results echo the filtered values.
- Ask "how many living members per city?" → one `count_profiles` call.
- Connect with **Read and make changes**; ask AI to add an address to a relative → becomes a
  Change Request ("not live until approved"); AI sees it in `myPendingRequests` on the next read.
- Edit my own linked profile through AI → applies directly.
- Make a Connection read only from the Manage drawer; AI's next call can't write.

**Owner/admin using an AI Client**

- Ask AI to create a profile or fix a DOB → applies directly; AI warned on a likely duplicate.
- See "via Claude" under the submitter in Reviews, History, My requests.

**Owner**

- Settings → AI: turn AI Client writes off for the whole community; write tools vanish for everyone
  on their next call; pending AI requests stay reviewable.

## Implementation decisions

### Custom field reads ([04](issues/04-custom-field-exposure-design.md), research [01](issues/01-custom-field-exposure-practice.md))

- Static tool schemas. `whoami.customFields: [{id,label,type}]` + `list_custom_fields` (same list).
  Server instructions: call one first.
- `field` refs take id or exact label (case-insensitive, trimmed); responses carry both; ambiguous
  label → `Invalid` with matching ids. Resolved at call time; deleted field → `Invalid` + current
  list.
- Per-org unique labels and `CUSTOM_FIELD_LIMIT = 50` (`src/lib/limits.ts`), both enforced on add
  only (`addOrganizationCustomField`); legacy duplicates stay. Text values ≤500 chars in the shared
  value schema (app + MCP).
- `get_profile.customFields`: every definition in order, `{id,label,type,value}`, `value: null`
  unset; orphan values hidden. Queries run under `Promise.all`.
- Dates (custom, `dateOfBirth`, `dateOfDeath`) are `YYYY-MM-DD` in and out on MCP; edge converts
  to/from stored ISO. App's `DatePicker` UTC shift is out of scope.

### Filters + aggregates ([04](issues/04-custom-field-exposure-design.md), [10](issues/10-aggregate-read-tools.md))

- Shared filter object in `src/domain/communityProfile.ts`, AND across fields: `query`, `gender`,
  `bloodGroup[]` (OR), `bornOnOrAfter`/`bornOnOrBefore`, `city`/`state`/`country`
  (case-insensitive trimmed exact, any address), `living` (from `dateOfDeath`), `customFieldFilters`
  (max 5, `json_extract` on `customFieldData`; ops text `eq`/`contains`, number
  `eq`/`gt`/`gte`/`lt`/`lte`, date `eq`/`before`/`after`, boolean `eq`, all `isSet`/`isNotSet`).
- `search_profiles` takes it; items echo filtered core + custom values only.
- `count_profiles({...filters, groupBy?})` → `{total, asOf, groups?, otherGroups, otherCount,
  overlapping?}`. `groupBy` `{core}`: `gender`, `bloodGroup`, `living`, `city`, `state`, `country`,
  `birthDecade`; or `{field}` for `text`/`boolean` custom fields (`number`/`date` → `Invalid` +
  range hint). ≤50 groups by count desc, rest in `other*`; non-empty `null` bucket always; places
  grouped on `lower(trim)`, labelled by most common spelling; a profile counts once per distinct
  place (`overlapping: true`). Count only, no cross-tabs.
- Deceased included by default; descriptions tell the model `living: true` for "alive/today".
- `active` only, all roles. Live D1, uncached.

### Graph cache ([07](issues/07-caching-design.md), research [03](issues/03-cf-caching-options.md), ADR 0008)

- `orgDataVersion(organizationId PK, version int)`; missing row = 0, no seed.
- Every applied `makeProfileChanges` plan upserts `version + 1` in its batch; `requested`-only
  doesn't. Drop `graphChanged`, `onGraphChanged`, `invalidateOrgGraph`.
- Lookup: version → `graph:{org}:v{n}` → isolate LRU (10 orgs) → KV (24h TTL, GC only) → D1
  rebuild (version + data in one `db.batch`, KV put in `waitUntil`). Version read only on blob
  routes (graph page, quick search, `get_family_graph`).
- Blob Actor-independent (active profiles + edges, email/mobile included); key has no role
  dimension.
- `src/domain/queries/graph.ts` with injected KV/LRU deps; app (`getFocusedCommunityGraph`,
  `searchCommunityProfilesLite`) and MCP share it.

### Write scope + gating ([05](issues/05-write-tool-catalogue.md), [08](issues/08-write-consent-ui-prototype.md), [11](issues/11-read-only-downgrade.md), ADR 0006)

- New OAuth scope `community:write`. Effective write = token scope ∩ live `oauthConsent.scopes` ∩
  org toggle, read in `loadConnectionActor`.
- `whoami.canWrite` + `reason` (`connection_read_only` | `org_writes_off`) + reconnect hint.
  `tools/list` omits write tools unless effective write (`cacheScope: "private"`). A stale write
  call → `isError` `WriteNotAllowed` with reason + hint.
- Org toggle: `orgSetting(organizationId PK, aiClientWrites bool)`, missing row = on. Owner-only
  server fn. Off → hidden for every role; Connections keep their scope; pending AI requests stay.
- Downgrade: our shrink-only server fn removes `community:write` from the caller's own consent row
  (idempotent). Tokens untouched. Plugin `/oauth2/update-consent` disabled via `disabledPaths`.
  Not an Audit Event. Re-upgrade = reconnect (same consent row updated).
- Existing Connections stay read only until reconnect.

### Write tools ([05](issues/05-write-tool-catalogue.md), research [02](issues/02-write-tool-practice.md))

- `create_profile`, `update_profile`, `add_relation`, `remove_relation`, `add_address`,
  `update_address`, `remove_address`. Same for every role; routing stays in `makeProfileChanges`.
- Inputs:
  - `create_profile`: `firstName`, `lastName` required; other core optional; `customFields?`;
    `self?: false`; `allowDuplicate?: false`. Description: search first.
  - `update_profile` / `update_address`: partial patch (`null` clears), `expectedVersion` required;
    edge merges onto current row → full `submit` input.
  - `customFields: [{field,value}]` patch, strict types (number, boolean, `YYYY-MM-DD`); unknown /
    mismatch → `Invalid` listing valid fields + types.
  - `add_relation {profileId,toId,type,bloodRelation?,note?}` = "toId is profileId's <type>"
    (outgoing), worked example; `remove_relation {profileId,relationId}` outgoing only.
  - `add_address`: `line1,city,state,country,postalCode` required; `line2,type,note,digipin`
    optional. `remove_address {profileId,addressId}`.
- `get_profile` adds `version` (profile + each address), relation `id`, `myPendingRequests:
  [{id,kind,createdAt}]`; `aiClient` subject rule widens to drafts the Actor created.
- Result `{outcome: applied|requested|unchanged|possible_duplicate, profileId, changeRequestId?,
  version?, addressId?, relationId?, candidates?, message}`. `SubmitResult` extended with new
  version + created ids. `requested`/`possible_duplicate` never `isError`.
- Errors: `toolErrorResult` maps `Invalid`/`Stale`/`Conflict`/`LimitReached`/`WriteNotAllowed` to
  `isError` + safe message + static hint; others "Internal error".
- Annotations: `readOnlyHint:false`, `openWorldHint:false`; `destructiveHint` true for updates +
  removes; `idempotentHint` true for updates + removes. Confirmation = host prompt only.
- Idempotency at MCP edge: exact repeat → `unchanged` + existing id (`add_address` on normalised
  line1+city+postalCode; `add_relation` on toId+type).
- Duplicate create: trimmed case-insensitive first+last among readable profiles, both DOBs set and
  different → no match. Match → nothing written, `possible_duplicate`, ≤5
  `{id,name,dateOfBirth,status}`.

### Guardrails + attribution ([06](issues/06-volume-abuse-guardrails.md), ADR 0007)

- Burst: 10 write calls/min per Connection, second CF RL binding, counts every call.
- Daily: 200 applied/requested per rolling 24h, `create_profile` sub-cap 50, counted from
  attributed Audit Events. Exceeded → `isError` "Write quota reached, resets in ~N min", never 429.
- RL keys `clientId:userId:orgId` (read limiter too).
- `PENDING_REQUEST_LIMIT = 50` per submitter per org (`src/lib/limits.ts`), in `makeProfileChanges`
  (app + MCP) → `LimitReached`.
- `viaClientId` + `viaClientName` nullable on `auditEvent` + `changeRequest`; `makeProfileChanges`
  takes optional `via`. Review events unattributed.
- No new read budgets.

### UI ([08](issues/08-write-consent-ui-prototype.md), prototype branch `prototype/write-consent-ui` variant B)

- Consent: when client asks `community:write`, "What can Claude do?" radio cards **Read only**
  (default) / **Read and make changes** (role-effect copy; disabled + "Turned off by your
  community" if toggle off). Allow sends `consent({accept:true, scope})` with the subset. Read-only
  request → screen unchanged.
- Connections table: Eye (+ amber Pencil) icons, "Read only" / "Read and make changes" subline from
  consent scopes. **Manage** → right drawer: Make read only (write) / reconnect instructions (read);
  Revoke moves in.
- Settings → AI tab: owner radio cards; others disabled + "Only the owner can change this";
  switching off → ConfirmDialog.
- Attribution byline: `Bot` icon + "via <client name>" under submitter in Reviews, History, My
  requests. No source filter, no quota UI.

### Analytics

- `mcp_tool_called` + `outcome` for write tools; `mcp_connection_created` + `write: bool`.
- New `connection_downgraded {orgId, clientId}`, `ai_client_writes_toggled {orgId, enabled}`.
- Never values or names.

### Docs

Public guide `src/routes/(public)/docs/mcp/index.tsx`: write access section (choosing Read and make
changes, member vs owner/admin effect, read only, reconnect to upgrade, quotas, owner toggle).

## Testing

- Seam (`freshDb` + batch callback): version bump on applied only, `via` stored on events +
  requests, `PENDING_REQUEST_LIMIT`, `SubmitResult` ids/version.
- Graph: injected KV/LRU fakes; version bump → new key; rebuild snapshot consistency.
- MCP tools (`src/server/mcp/tools/*.test.ts`): gating matrix token × consent × toggle, filters per
  op/type, groupBy bounds + null + overlap, field resolution (id/label/ambiguous/deleted), patch
  merge, `Stale`, idempotent repeats, duplicate detection, quotas (burst + daily + create sub-cap).
- Domain: unique label + 50 cap, 500-char text, shrink-only downgrade fn.
- UI: browser-verified via dev preview per slice (responsive, breadcrumbs).
- HITL smoke on real claude.ai (slice 22).

## Out of scope

Batch writes; reviews/withdraw/deactivate/delete/reassign via MCP; writes to Custom Field
Definitions; `list_my_requests`; in-app chat; app `DatePicker` date normalisation; step-up auth;
quota usage UI; attribution source filter.

## Slices

{[12 graph cache](issues/12-graph-cache-versioned.md),
[13 custom field reads](issues/13-custom-field-reads.md),
[16 write scope + gating](issues/16-write-scope-and-gating.md),
[18 attribution + pending limit](issues/18-attribution-and-pending-limit.md)} →
{[14 shared filters](issues/14-shared-filters.md) (13),
[17 Connections Manage drawer](issues/17-connections-manage-drawer.md) (16),
[19 profile write tools](issues/19-profile-write-tools.md) (13, 16, 18)} →
{[15 count_profiles](issues/15-count-profiles.md) (14),
[20 relation + address write tools](issues/20-relation-address-write-tools.md) (19)} →
[21 docs](issues/21-mcp-guide-write-docs.md) (15, 17, 20) →
[22 claude.ai smoke](issues/22-claude-ai-smoke.md) (21, HITL).
