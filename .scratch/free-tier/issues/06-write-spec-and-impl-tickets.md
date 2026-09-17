# 06 — Write PRD and implementation tickets

Parent: [MAP.md](../MAP.md) Label: `wayfinder:task` Status: `closed` Assignee: nisargrbhatt
(wayfinder session) Blocked by: [03](03-limit-enforcement-design.md),
[04](04-onboarding-and-gates-post-rip.md), [05](05-limit-ui-prototype.md)

## Question

Fold all decisions into `.scratch/free-tier/PRD.md` (`/to-prd`) and numbered impl issues
(`/to-issues`), tracer-bullet order: rip Stripe → limits lib + server enforcement → UI → docs
(CLAUDE.md, ADR). Mark each `ready-for-agent`.

## Comments

**Resolution** (2026-09-17): [PRD.md](../PRD.md) written (11 sections, every line cites its owning
ticket). Four impl issues, tracer-bullet order, all `ready-for-agent`:

- [07 — Rip Stripe billing](07-rip-stripe-billing.md) — no deps.
- [08 — Limits lib + server-side enforcement](08-limits-lib-and-enforcement.md) — after 07.
- [09 — Limit UI](09-limit-ui.md) — after 08.
- [10 — Docs: CLAUDE.md, ADR 0002 amend, ADR 0003, CONTEXT.md](10-docs-and-adrs.md) — after 08
  (parallel with 09).

Out-of-repo human steps (CF secrets, Stripe webhook endpoint) flagged in 07 for the PR body.
