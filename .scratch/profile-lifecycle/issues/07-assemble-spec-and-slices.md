# Assemble spec and implementation slices

Type: grilling
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06

## Question

Write `.scratch/profile-lifecycle/spec.md` from the resolved tickets and slice it into
implementation tickets (tracer-bullet order: schema + seam + audit first, then create flow on the
queue, then info / relation / address requests, then UI views). Settle any fog left in the map.

## Answer

Grilled 2026-10-10. Spec: [spec.md](../spec.md). ADR
[0005](../../../docs/adr/0005-audit-log-snapshots-kept-forever.md) (audit snapshots, no FKs,
kept forever incl. deleted profiles' PII). Fog graduated:

- **Badges**: `changeRequestKeys` (`all/queue/pendingCount/mine/unseenCount/forProfile`) +
  `auditKeys`; loaded in Community layout, `staleTime` 60s + focus refetch, no polling; every
  profile/relation/address/review/withdraw mutation invalidates `changeRequestKeys.all` +
  `profileKeys.all` + `auditKeys.all`; My requests visit → `markRequestsSeen`.
- **Audit pagination**: by group server-side, key `coalesce(changeRequestId, id)`, order
  `(latestAt, groupKey)` desc, 25 groups/page; filter matches group if any event matches.
- **Analytics**: client-side `change_request_submitted/reviewed/withdrawn {kind,…}`,
  `profile_deactivated/reactivated/deleted`, `{outcome}` on `profile_saved`/`member_added`; retire
  `member_profile_accepted/rejected`; no values/names.
- **Remote-D1 smoke test**: first slice, AFK (HITL fallback if wrangler unauthenticated).
- **Lifecycle UI**: member detail "⋯" menu, owner/admin; delete owner-only; confirm dialogs warn
  of superseded requests.

Slices (all AFK, app shippable after each): {[08 smoke test](08-remote-d1-guard-smoke-test.md),
[09 schema](09-schema-migration-permissions.md)} → {[10 seam direct-apply](10-mutation-seam-direct-apply.md),
[12 visibility](12-read-side-visibility.md)} → {[11 create on queue](11-create-flow-on-queue.md),
[16 history + audit log](16-history-and-audit-log.md)} →
[13 member requests](13-member-change-requests.md) → {[14 Reviews page](14-reviews-page.md),
[15 member side](15-member-suggest-and-my-requests.md)}.
