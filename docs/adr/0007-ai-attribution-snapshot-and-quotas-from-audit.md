# AI attribution is a snapshot on the row; write quotas count Audit Events

A change or Change Request made through a Connection stores nullable `viaClientId` +
`viaClientName` (name snapshot) on `auditEvent` and `changeRequest`; null means in-app. The Actor is
still the member. The daily per-Connection write quota (200/24h, 50 creates) is counted from
attributed Audit Events (`viaClientId` + actor + org) on the existing
`auditEvent_org_actor_created_idx`, not from a counter table; the 10/min burst uses a Cloudflare
Rate Limiting binding.

- **Considered**: referencing the consent row id (dies on disconnect, and ADR 0005 keeps audit
  forever); a separate quota counter table (a second write per change that can drift from what
  actually applied).
- **Consequences**: only `applied` / `requested` outcomes count, since only they write events;
  `unchanged`, `possible_duplicate` and errors are free. A renamed client keeps its old name on old
  rows.
