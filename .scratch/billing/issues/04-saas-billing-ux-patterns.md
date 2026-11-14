# SaaS billing UX patterns

Type: research Status: resolved Blocked by:

## Question

How do well-regarded SaaS products (e.g. Linear, Vercel, Notion, Slack, Cal.com, GitHub org plans)
handle per-workspace billing UX: card-less trial onboarding, trial countdown banners, the billing
settings page (status, next charge, payment method, invoice history), failed-payment / grace
messaging, the lock / paywall screen for owners vs non-owners, cancel and re-subscribe flows, and
reminder email cadence? Distil into concrete patterns and copy examples we can adopt, flagging
anti-patterns.

## Answer

Detail + sources: `.scratch/billing/research/saas-billing-ux-patterns.md`.

- Card-less trial: no payment UI at create; show concrete end date + "no charge unless you add
  payment details". Card added mid-trial arms conversion at trial end, no early charge (Slack,
  Vercel).
- Owner banner: neutral -> warning in last 3 days; with card on file becomes "charged $5 on <date>".
  Non-owners: no CTA, at most "an owner needs to add payment details".
- Billing page: status card w/ state-specific action, next charge, payment method (last4, update),
  billing email, invoice table, cancel in danger zone.
- Grace: one fix action (update card -> immediate retry), auto-unlock on success, no charge for
  locked time (GitHub). Lock only after PSP retries exhausted (Slack 28d, Notion ~1mo).
- Lock screen: owner vs non-owner variants; always "data is safe"; non-owners see owner names +
  switch/leave; "processing payment" state while webhook lands.
- Cancel: dialog states end date + data kept; pending cancel shows [Resume]; after Lock re-subscribe
  = fresh checkout.
- Emails: T-3/T-1 fine for card-less; add T-7 "will be charged" if card on file (card-network
  convention, Stripe default 7d); payment failed immediately + mid-grace + day before Lock.
- Anti-patterns: lock before retries end, paywall to non-owners, ambiguous data-loss copy,
  support-only cancel/unlock, back-charging locked time.
