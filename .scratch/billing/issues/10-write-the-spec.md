# Write the billing spec

Type: task Status: resolved Blocked by: 05, 06, 07, 08, 09, 12

## Question

Write `.scratch/billing/spec.md` and any ADRs from the resolved tickets, plus a step-by-step setup
checklist for the user with exact values: Dodo API key (test/live), webhook endpoint URL + events to
subscribe + secret, env var names (`.dev.vars`, wrangler secrets), return URLs, product id, and
local webhook testing. Then slice into implementation tickets.

## Comments

- From 03: setup checklist must include turning OFF portal "Allow Immediate Cancellation" (map:
  access until period end), checkout `allow_discount_code` choice, and the Dodo email toggles chosen
  in 09.

- From 09: setup checklist must include Dodo dashboard → emails: turn **off** Trial Ending; keep
  Receipt + Cancelled on; payment-failed/renewal-failed off.

- From 12: spec includes PostHog server events list, "+ applicable tax" price copy, and local dev
  section (`dodo wh listen`, cloudflared tunnel, short `trial_period_days` to simulate expiry, unit
  tests for `billingAccess`).

## Answer

Written 2026-11-14: [spec.md](../spec.md). No new ADRs (only 0013). Gaps filled in spec: webhook
path `/api/billing/webhook`, return URLs `?from=dodo` + `syncBillingFn`, env names (`DODO_*`, all
secrets), cancel/resume via own server fns (not portal), webhook adopt-or-ignore rule, PostHog
events from `billingAccess` diffs, Dodo grace 7d + retries window 7d, "On Hold, No Payment Method"
email off. Implementation tickets 13–22 (setup checklist 13 is `ready-for-human`).
