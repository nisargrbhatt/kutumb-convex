# Reminders and scheduled transitions

Type: grilling Status: resolved Blocked by: 03, 05

## Question

Which emails do we send vs Dodo, and what triggers them? Time-based events (Trial T-3, T-1, Trial
end → Lock, grace end → Lock) need a clock: Workers cron trigger, lazy evaluation at request time,
or both? Dedupe so an email goes once. Recipients (all owners), and the soft heads-up to members in
the last 3 days (in-app only?).

## Comments

- From UX research (04): if a card is on file, the Trial auto-converts — consider a T-7 "you'll be
  charged $5 on <date>" notice (maybe Dodo's job as MoR; see 03). Also consider a member heads-up
  near grace end, not only Trial end.
- From 03: Dodo sends Trial Ending (~T-2, on by default) and an untoggleable "Add Payment Method
  Reminder" for card-less trials; payment-failed/renewal emails off by default; no card-expiring
  email (ours to build via payment-methods API if wanted). Dodo emails go to the one customer email
  only, not all owners. Decide overlap with our T-3/T-1.
- From 05: Trial end and Lock are derived by `billingAccess(row, now)` — no transition job needed
  for the Lock itself (Dodo moves the sub to `on_hold`); a clock is needed only for our emails.

- From 06: periodic sweep must also retry `ensureSubscription` for rows with `needsSubscription`.

## Answer

Grilled 2026-11-14.

1. **Clock:** billing sweep added to the existing hourly `scheduled()` (`src/server.ts`, cron
   `0 * * * *`) beside blob sweep. Emails only; Lock stays lazy via `billingAccess(row, now)`.
2. **Dodo vs ours:** Dodo Trial Ending toggle **off** (ours reach all owners). Dodo Receipt +
   Cancelled/set-to-cancel stay on; payment-failed/renewal-failed stay off. Untoggleable Add Payment
   Method Reminder accepted as duplicate.
3. **Trial emails (ours, sweep):** no card → T-3 + T-1 "add payment or org locks on <date>". Card on
   file → T-3 only "first charge $5 on <date>".
4. **Payment failure (ours):** on entering `grace` — webhook-triggered, immediate; plus one reminder
   at grace end −2d (sweep).
5. **Lock email (ours, sweep):** once per Lock, all owners, copy per `lockReason`
   (`trial_ended|payment_failed|canceled`). No member email.
6. **Canceling:** no email of ours (Dodo's + Lock email suffice).
7. **Dedupe:** D1 `billingNotice(organizationId, kind, anchor)` unique; anchor = `trialEndsAt` /
   `pastDueEndsAt` / lock date. Insert-or-ignore, send only if inserted. Missed windows → send only
   latest due notice; never remind for a passed deadline.
8. **Recipients:** all owners at send time, one email each. Send failure → delete notice row, next
   sweep retries.
9. **Members/admins:** in-app banner only ("billing needs attention, ask an owner") in last 3 days
   of a card-less Trial and during `grace`; from `billingAccess`. No email.
10. **Sweep** also retries `ensureSubscription` for `needsSubscription` rows hourly, no extra
    backoff.
