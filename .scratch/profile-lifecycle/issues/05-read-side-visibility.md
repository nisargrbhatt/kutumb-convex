# Read-side visibility of drafts and pending changes

Type: grilling Status: resolved Blocked by:

## Question

Enumerate every read of Community Profiles, relations, and addresses (members list + filters, member
detail, community tree/graph + KV cache, relation picker `getActiveProfilesForRelation`,
`searchCommunityProfilesLite`, dashboard counts, memories, MCP tools) and settle per read:

- Whether `draft` profiles appear, and for whom (creator + owner/admin only).
- Whether pending Change Requests are surfaced (e.g. "edit pending" marker) and for whom.
- How the per-viewer rule interacts with the org-wide graph cache.
- Whether the members-list `status` filter still offers `draft` to plain members.

Use a sub-agent to list the reads; the decisions are the user's.

## Answer

Resolved 2026-10-10 (grilling). Read inventory: 17 paths; no read checked role before this.

**Visibility rule** (one Actor-aware predicate in `src/domain/queries/profiles.ts`, applied by every
D1 read: list, detail, relations, counts; non-visible → `NotFound`, never `Forbidden`):

- Owner/admin: every profile, any status.
- Plain member: `active` profiles + drafts they created (creator = submitter of pending create
  request, per
  [Change Request and Audit Event data model](03-change-request-and-audit-data-model.md); backfilled
  drafts → owner/admin only) + own linked profile whatever its status.
- `inactive` hidden from plain members (list, detail, counterparts).

**Per read**

- Members list (`listCommunityMembers`): predicate applied. Status filter for plain members =
  "All" + "Draft" ("my drafts"); `inactive` option hidden. Owner/admin keep all options, default
  "All".
- Member detail (`getCommunityProfileDetail`): predicate on subject; outgoing + incoming relations
  drop counterparts the viewer can't see, silently (no placeholder).
- My relationships + dashboard incoming/outgoing relation counts: same counterpart filter.
- Tree / `getFocusedCommunityGraph` / `searchCommunityProfilesLite` / relation picker
  `getActiveProfilesForRelation`: unchanged, active-only for everyone incl. creator + owner/admin.
  KV blob stays one org-wide key, no per-viewer overlay. A draft is never a relation target.
- Dashboard active count: unchanged (active only). Org usage count: unchanged (all statuses = Member
  limit; count only).
- Own profile (`getMyCommunityProfile`), own addresses, custom field defs: unchanged.

**Pending marker**: member detail banner only. Owner/admin: "N pending changes" → Reviews.
Submitter: "Your change is pending" → My requests. Draft: "Awaiting review". Everyone else: nothing.
Displayed data = approved state, no merged preview. No marker in members list.

**MCP** (in scope, own slice; all roles incl. admin): `search_profiles` loses `status` input (active
only); `get_profile` NotFound for non-active except caller's own; counterparts filtered to active;
`get_family_graph` unchanged.
