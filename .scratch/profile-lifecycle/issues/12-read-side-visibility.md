# Read-side visibility

Type: AFK Status: ready-for-agent Blocked by: 09

Spec: [spec.md § Read-side visibility](../spec.md)

## What to build

Per [Read-side visibility](05-read-side-visibility.md):

- One Actor-aware visibility predicate in `src/domain/queries/profiles.ts`; owner/admin all;
  plain member `active` + drafts they created (submitter of pending create request) + own linked
  profile. Applied to members list, detail (subject → NotFound), outgoing/incoming relations +
  My relationships + dashboard relation counts (counterparts filtered silently).
- Members list status filter for plain members: All + Draft; owner/admin unchanged.
- Tree / graph / picker / lite search / KV cache / counts: untouched (assert active-only).
- MCP: `search_profiles` drops `status` input; `get_profile` NotFound for non-active except
  caller's own; counterparts active-only; descriptions updated.

## Acceptance criteria

- [ ] query tests per role × status (draft own/other/backfilled, inactive, own inactive linked)
- [ ] MCP tool tests updated; cross-role NotFound
- [ ] browser: plain member can't open another's draft or inactive profile by URL
