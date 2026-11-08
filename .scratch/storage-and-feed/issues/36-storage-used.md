# Storage used on settings overview

Status: ready-for-agent Blocked by: 23

## What to build

`getOrgUsage` returns `SUM(size)` of `attached` Blobs for the org. Settings overview shows it as a
plain number, no limit bar.

## Spec

[spec.md](../spec.md): Storage used.

## Done when

- [ ] Number matches attached Blobs only: `pending` and `deleted` don't count.
- [ ] An org with no Blobs shows zero.
