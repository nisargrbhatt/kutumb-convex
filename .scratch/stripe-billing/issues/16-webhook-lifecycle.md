# 16 — Webhook lifecycle, org deletion and the `onEvent` guards

Parent: [PRD.md](../PRD.md) §7.3 Label: `impl` Status: `closed` Depends on:
[13](13-billing-status-and-gates.md), [14](14-create-checkout-session.md)

## Goal

The webhook is the **sole writer** of billing state, and it is stateless and idempotent by
construction.

## Scope

1. **`syncSubscriptionFromStripe(stripeSubscriptionId)`** — used by **every** subscription event:
   ```ts
   const sub = await stripe.subscriptions.retrieve(event.data.object.id);
   await db.update(subscription).set(fromStripe(sub)).where(...);
   ```
   The payload supplies only an id; we re-retrieve and write **current** truth. A replayed or
   out-of-order event therefore cannot write stale state — **ordering stops mattering, and there is
   no `lastEventAt` column** ([07](07-webhook-lifecycle-and-org-deletion.md) §1).
   `pending_update_applied`, `pending_update_expired`, `paused` and `resumed` need **no branch** —
   this generic path covers them.
2. **`deleteOrganizationCompletely(orgId)`** in the billing module, called on
   `customer.subscription.deleted`:
   ```ts
   await db.delete(organization).where(eq(organization.id, orgId));
   ```
   **Zero tables by hand** — every child of `organization.id` cascades and D1 enforces FKs
   ([04](04-org-delete-cascade-audit.md)). **Not** `auth.api.deleteOrganization`: the caller is
   Stripe, there is no session to authorize with, and forging one inside a webhook is worse than
   losing `beforeDeleteOrganization`/`afterDeleteOrganization` (nothing needs them today). The named
   seam exists so future external cleanup — Stripe customer deletion, asset purge — has an obvious
   home. Deletion is **unconditional, irreversible and silent**. Settled policy, not this slice's to
   soften.
3. **`onEvent` guards** — they must live here, **not** inside the plugin's handlers, which wrap
   everything in `try/catch` and swallow, so a guard placed there can never 400. `onEvent` runs
   after each built-in handler and its throws propagate to the outer catch (→ `BAD_REQUEST`).
   - Org resolution fails → **throw**, so Stripe retries with backoff (~3 days).
   - **One exemption — org gone:**
     ```ts
     if (!org) {
     	console.warn("stripe webhook: org gone", { orgId, event: event.type });
     	return new Response(null, { status: 200 });
     }
     ```
     After an unconditional deletion this is terminal and expected, not transient; three days of red
     retries would be noise for something working as designed.
4. **Event selection on the Stripe endpoint:** `checkout.session.completed` +
   `customer.subscription.created/.updated/.deleted/.paused/.resumed` and the `pending_update_*`
   pair. **No `invoice.*` at all** — `invoice.payment_failed` already surfaces as a subscription
   status change, so subscribing would add a second redundant route to the same state. **Dunning
   needs no code** ([07](07-webhook-lifecycle-and-org-deletion.md) §5).
5. **Signature verification: write none.** The plugin owns the endpoint and verifies with
   `constructEventAsync`; `STRIPE_WEBHOOK_SECRET` goes into its config
   ([11](11-stripe-plugin-and-schema.md) already wired it).

## ⚠️ The one thing easiest to get backwards

**Map on `subscription.status` only. Never consult `pause_collection`.** They are different things:
`status: "paused"` arises only when a trial ends with no payment method (unreachable for us — we
create no trials), while `pause_collection` is a separate manual dashboard field that leaves
`status: "active"`. A paused-collection org therefore **stays usable** — that is the point of
pausing collection, and blocking it would lock out the customer we chose to help
([07](07-webhook-lifecycle-and-org-deletion.md) §4).

## Acceptance

Via `stripe listen` / `stripe trigger` (test mode):

- `checkout.session.completed` → row flips `incomplete` → `active`, org usable.
- `customer.subscription.created` → **exactly one** row for the org.
- `.updated` → `past_due` → blocked; back to `active` → usable.
- `.deleted` → org row gone, children cascaded, every member's `session.active_organization_id`
  **nulled** (not dangling), and the affected user's next request redirects to `/onboarding/create`.
- Replaying any event lands the same end state.
- An event for an already-deleted org → logged **200**, no retry storm.
- `pause_collection` set from the dashboard → org **stays usable**.

## Comments

Implemented:

- `src/lib/subscription-from-stripe.ts` — pure, no `db` import (mirrors
  `checkout-session-params.ts`'s convention so it stays plain-Vitest-testable): `fromStripe(sub)`
  maps a retrieved `Stripe.Subscription` to the plugin's verbatim row columns
  (`periodStart`/`periodEnd`/`billingInterval` come off `sub.items.data[0]`, not the subscription
  top level — Stripe SDK v22's flexible billing mode moved them there); `requireReferenceId(sub)`
  reads `sub.metadata.referenceId`, throwing if absent. Unit-tested in the sibling `.test.ts`.
- `src/lib/billing-webhook.ts` — `syncSubscriptionFromStripe(stripeSubscriptionId)` (retrieve +
  `db.update(...).where(eq(subscription.referenceId, orgId))`),
  `deleteOrganizationCompletely(orgId)` (bare `db.delete(organization)`), and
  `resolveOrgIdOrGone(sub, eventType)`, the `onEvent` guard: throws via `requireReferenceId` if the
  subscription carries no `referenceId` metadata (resolution failure → Stripe retries), otherwise
  checks the org still exists and warns + returns `null` if not (terminal, expected, no retry).
- `src/lib/auth.ts` — `onStripeEvent` wired as `onEvent` in the `stripe()` plugin block. Dispatches
  `created`/`updated`/`paused`/`resumed`/`pending_update_applied`/`pending_update_expired` through
  the guard then `syncSubscriptionFromStripe`; `deleted` through the guard then
  `deleteOrganizationCompletely`. `checkout.session.completed` has no case — the plugin's own
  built-in handler already re-retrieves and writes current truth, so there's nothing left to do.

Org resolution mechanism (left open by 07/16's pseudocode): every subscription created through our
checkout carries `metadata.referenceId` (`checkout-session-params.ts`'s
`subscription_data.metadata`), and Stripe keeps that metadata for the subscription's whole lifecycle
including on `customer.subscription.deleted`. Reading it off the retrieved (or, for `.deleted`, the
event's own) subscription object is the resolution step — no separate customer→org lookup needed. A
subscription missing that metadata (e.g. created by hand in the Stripe dashboard) is treated as a
genuine resolution failure and throws, per spec.

No migration needed — the `session.active_organization_id` FK with `onDelete: "set null"` already
landed in [11](11-stripe-plugin-and-schema.md) (`migrations/0002_icy_blue_blade.sql`), so the
"nulled on delete" acceptance criterion was already satisfied before this ticket started.

Not done here: the `stripe listen`/`stripe trigger` manual verification pass and the Stripe
Dashboard webhook endpoint's event-type selection (§4) — both are external/account-side steps
outside this repo, left for the user to run against a test-mode endpoint.

`/code-review` found two real gaps, both fixed:

- `deleteOrganizationCompletely` left `subscription` orphaned. `subscription.referenceId` carries
  **no FK** — it's the plugin's polymorphic user-or-org reference column, and
  [04](04-org-delete-cascade-audit.md)'s cascade audit predates this table (Polar era) so never
  covered it. Scope item 2's "zero tables by hand" claim doesn't hold for this one table. Fixed with
  an explicit `db.delete(subscription).where(eq(subscription.referenceId, orgId))` before the org
  delete.
- `syncSubscriptionFromStripe` was a bare `UPDATE ... WHERE referenceId = orgId`, which silently
  no-ops if no local row exists yet (a subscription created outside our checkout, e.g. by hand in
  the dashboard for an org with an existing Stripe customer). Changed to an upsert
  (find-then-update- or-insert) so the "stateless and idempotent by construction" goal holds for
  every subscription event, not just checkout-originated ones.
