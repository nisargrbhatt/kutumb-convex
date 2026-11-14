Label: wayfinder:map

# Billing

## Destination

A spec at `.scratch/billing/spec.md` plus ADRs, ready to slice into implementation tickets at
`.scratch/billing/issues/`, for per-organization Subscription billing through Dodo Payments: Trial,
paying, invoices, managing payment details, and Lock. Includes a step-by-step Dodo dashboard / env /
webhook setup checklist for the user. No feature code in this map; throwaway prototypes are fine.

## Notes

- Domain: `GLOSSARY.md` terms **Subscription**, **Trial**, **Lock**, **Org Member**, **Connection**,
  **AI Client**. Limits per ADR 0003; MCP consent per ADR 0004/0006.
- Skills to consult: `grilling` + `domain-modeling` (default), `better-auth-best-practices`,
  `better-auth-security-best-practices`, `workers-best-practices`, `wrangler`,
  `tanstack-start-best-practices`, `tanstack-query-best-practices`, `codebase-design`.
- Source brief: `TODO.md`. Docs: https://better-auth.com/docs/plugins/dodopayments
- Work happens on branch `feat/storage-integration` only: research findings land in
  `.scratch/billing/research/` on this branch, no `research/*` branches.
- Dodo: Test Mode, `dodo` CLI signed in (read-only use). Product `Standard`
  `pdt_0NrRhQONNdCc90vSRvBEo`, $5/month, tax category saas. User set a 15-day trial in the Dodo
  dashboard.
- Standing decisions from charting:
  - One Subscription per organization, billed to the org (customer name = org name, billing email =
    an owner's). A user in 5 orgs pays 5 times. Any owner manages billing; admins/members never see
    it.
  - Trial: 15 days, nothing to pay up front, card-less (Subscription exists from org create).
    "Invoice due on <date>" is UX framing, not necessarily a Dodo object (research decides).
  - After create org: land on dashboard + one-time "Trial started" dialog [Add payment now] /
    [Later]. No forced payment screen.
  - Owners: persistent Trial banner with days left. Admins/members: nothing until Lock, maybe a soft
    heads-up in the last 3 days.
  - Lock = org unusable: UI, server functions, APIs and MCP all refuse. Data untouched; paying lifts
    it at once. Still allowed under Lock, everyone: switch org, leave org, account settings, sign
    out, accept invites to other orgs. Owners also: billing page, delete org, transfer ownership.
    Inviting blocked.
  - Cancel: access until paid period ends, then Lock. Re-subscribe any time, also after Lock.
  - Delete org with live Subscription: cancel immediately, no refund.
  - Failed renewal: 7-day grace with owner banner, then Lock (research may refine).
  - Our Resend emails to all owners: Trial T-3, T-1, on Lock, on payment failure. Receipts/invoices
    left to Dodo's own emails (research may refine split).
  - Single plan only.
  - No migration: DB wiped on merge; existing orgs don't exist.

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [SaaS billing UX patterns](issues/04-saas-billing-ux-patterns.md): card-less trial, cancel at
  period end, instant unlock all confirmed; owner vs non-owner lock screens, "data is safe" copy;
  grace should follow Dodo's retry window, not a fixed 7 days.
- [better-auth Dodo plugin fit for org billing](issues/02-better-auth-dodo-plugin-fit.md): skip the
  plugin (per-user, spoofable referenceId); use `dodopayments` SDK directly + own webhook route and
  billing tables. Both run on Workers.
- [Dodo invoices, customer portal and native emails](issues/03-dodo-invoices-portal-emails.md):
  invoices only after payment (PDF via API); "due on" is UX from `next_billing_date`; portal (24h
  link, per customer) covers card update, retry, cancel, history; Dodo emails receipt +
  trial-ending.
- [Dodo subscription lifecycle and trial](issues/01-dodo-subscription-lifecycle.md): card-less trial
  supported natively (sub `active`, no card → `on_hold` at trial end); no trial status, we derive
  it; grace = Dodo `past_due` 7d → `on_hold`; terminal states need new checkout; webhooks dedupe on
  id.
- [Dodo Test Mode probe](issues/11-dodo-test-mode-probe.md): card-less Trial sub creatable
  server-side (no checkout; billing address sent, need untested); many customers per email OK;
  product flags confirmed; Trial Ending email unverified (check ~11-27).
- [Billing state model](issues/05-billing-state-model.md): Dodo owns Trial clock (sub at org create,
  address on create form, ADR 0013); D1 `orgBilling` row, webhook dedupe + refetch; states
  pending/trialing/active/canceling/grace/locked(+reason) via pure `billingAccess(row, now)`.
- [Org lifecycle and the Dodo customer](issues/06-org-lifecycle-and-dodo-customer.md): own server fn
  creates org + customer + sub; country-only address; Dodo down → org still created, idempotent
  retry; rename/owner-change sync to customer; delete blocked until sub cancelled; farming ignored.
- [Lock enforcement seam](issues/07-lock-enforcement-seam.md): default-deny check in `orgMiddleware`
  (JOIN `orgBilling`, no KV) + `AllowLocked` variant; `/locked` route (org switcher, sign out,
  leave, owner pay/delete/transfer); org hooks block invite/rename; `Locked` AppError; MCP tool
  errors; blobs 403.
- [Billing UX prototype](issues/08-billing-ux-prototype.md): Variant A: stacked cards on
  `/settings/billing` (status + action, payment, details, invoice table, cancel zone); full-width
  banner strip; centred-card `/locked`; copy per state in ticket. Branch `prototype/billing-ux`.
- [Reminders and scheduled transitions](issues/09-reminders-and-scheduling.md): hourly cron sweep
  (emails + `ensureSubscription` retry), Lock stays lazy; ours to all owners: Trial T-3/T-1 (card on
  file: T-3 only), grace start (webhook) + grace −2d, Lock; Dodo Trial Ending off; `billingNotice`
  dedupe; members in-app banner only.
- [Fog sweep: overrides, analytics, tax display, Locked data](issues/12-fog-sweep.md): no support
  overrides; server-side PostHog billing events; show "$5/month + applicable tax" (pre-tax); Locked
  org data kept forever.
- [Write the billing spec](issues/10-write-the-spec.md): [spec.md](spec.md) written; setup checklist
  inside; sliced into implementation tickets 13–22 (Dodo setup → foundation → create, webhook, Lock
  seam → page, lock screen, banner, org sync, reminders).

## Not yet specified

<!-- none: map complete -->

## Out of scope

- Multiple plans, yearly billing, seat pricing, plan switching, coupon UI.
- Migrating existing orgs (DB wiped on merge).
- Support overrides (extend Trial / comp an org): Dodo dashboard or manual D1 edit if ever needed;
  see [Fog sweep](issues/12-fog-sweep.md).
- Retention/deletion of long-Locked orgs: data kept forever in v1; see
  [Fog sweep](issues/12-fog-sweep.md).
