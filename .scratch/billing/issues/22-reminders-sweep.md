# Billing reminders and sweep

Status: resolved Blocked by: 16

## What to build

`billingSweep` in hourly `scheduled()`: pure `dueNotices(row, now, sent)`, `billingNotice` dedupe,
react-email templates, send to all owners. `grace_start` from webhook. `locked` notice fires
`billing_locked`. Retries `ensureSubscription` for `needsSubscription` rows.

## Spec

[spec.md](../spec.md): Reminders, Analytics.

## Done when

- [ ] `dueNotices` tests: T-3/T-1 card-less, T-3 only with card, grace −2d, lock once, missed
      windows send only latest, passed deadlines never.
- [ ] Each notice sent once per anchor; send failure retried next hour.
- [ ] Emails previewable in `npm run email:dev`.
