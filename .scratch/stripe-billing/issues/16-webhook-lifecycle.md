# 16 — Webhook lifecycle, org deletion and the `onEvent` guards

Parent: [PRD.md](../PRD.md) §7.3 Label: `impl` Status: `ready-for-agent` Depends on:
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
