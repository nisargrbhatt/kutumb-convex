# Member side: Suggest drawers + My requests

Type: AFK Status: ready-for-agent Blocked by: 12, 13

Spec: [spec.md § UI, § Query keys + badges](../spec.md)

## What to build

- Active Userless Profile detail (plain member): "Suggest edit" (whole info form incl. Custom
  Field Values, `expectedVersion`, only changed fields sent), "Suggest address" (add / edit /
  remove), "Suggest relation" (outgoing add / remove). Right drawers, react-hook-form + zod.
  Toast + banner after submit; `unchanged` → toast "No changes".
- Banners: submitter "Your change is pending" → My requests; draft "Awaiting review".
- `/my-requests` (all members): breadcrumbs, DataTable (kind, profile, status, outcome
  reason/note + reviewer, submitted); row → drawer with status, outcome alert, diff; Withdraw →
  confirm dialog ("draft will be deleted" for create). Visiting calls `markRequestsSeen`.
- Community nav: My requests with unseen-outcome badge.
- Reference: prototype variant A.

## Acceptance criteria

- [ ] responsive; drawers usable on phone
- [ ] browser: member suggests each kind, sees pending, admin approves (via 14 or seam), member
  sees badge → visits → badge clears
- [ ] `Stale` on submit → "Profile changed, reload" toast
