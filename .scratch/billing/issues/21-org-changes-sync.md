# Org changes sync to the Dodo customer

Status: resolved Blocked by: 15

## What to build

Rename → customer name. Billing-email owner leaves / removed / demoted → longest-standing remaining
owner's email (leave via `auth-hooks.ts` after middleware). Org delete → cancel sub now first; Dodo
error blocks delete.

## Spec

[spec.md](../spec.md): Org changes → Dodo customer.

## Done when

- [ ] Rename + email sync best-effort (failure logged, user action succeeds).
- [ ] Delete with live sub cancels it in Dodo; terminal / no sub skips; Dodo error → delete refused
      with retry message.
