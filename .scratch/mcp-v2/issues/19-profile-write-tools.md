# Profile write tools + quotas

Type: AFK Status: open Blocked by: 13, 16, 18

Spec: [spec.md § Write tools, § Guardrails + attribution](../spec.md)

## What to build

- `create_profile` (incl. `self`, `allowDuplicate`, duplicate detection → `possible_duplicate`
  with ≤5 candidates) and `update_profile` (patch + `expectedVersion`, edge merge, strict
  `customFields` via 13's resolver). Pass `via` to the seam.
- Result shape + messages; `toolErrorResult` hints for `Invalid`/`Stale`/`Conflict`/`LimitReached`.
  Annotations per spec.
- `get_profile`: `version`, relation `id`, address `version`, `myPendingRequests`; `aiClient`
  subject rule includes Actor's own drafts.
- Quotas: second RL binding (10/min, write calls), daily 200 + 50 creates from attributed Audit
  Events; RL keys `clientId:userId:orgId` (read limiter too). `mcp_tool_called.outcome`.

## Acceptance criteria

- [ ] tool tests: owner → applied, member on userless → requested (+ in `myPendingRequests`),
      own linked → applied, repeat → unchanged, stale version → `Stale` hint
- [ ] duplicate match/no-match (DOB differs), `allowDuplicate` forces
- [ ] quota tests: burst, daily, create sub-cap; unchanged/duplicate/errors not counted
- [ ] tools absent from `tools/list` without effective write
