# 07 — Webhook lifecycle and org deletion

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: ~~[04](04-org-delete-cascade-audit.md)~~ (closed),
~~[06](06-subscription-state-model.md)~~ (closed) — **unblocked, on the frontier**

## Question

The map fixed the approach — derive from `subscription.status` on every event, delete the org on
`customer.subscription.deleted`. Fill in the table.

- ~~Exhaustive mapping: `active`, `trialing`, `past_due`, `unpaid`, `incomplete`,
  `incomplete_expired`, `paused`, `canceled` → org usable / blocked / deleted.~~ **Settled by
  [06](06-subscription-state-model.md)** — full table lives there. `active`/`trialing` usable;
  everything else blocks, splitting into `pending` vs `past_due`. **`past_due` blocks immediately is
  policy, already decided — do not re-litigate.** What is still open here: a Stripe `paused`
  subscription and `pause_collection` are different things; pick which one the brief's
  `customer.subscription.paused` event means. [06](06-subscription-state-model.md) only says that
  whichever lands as `status: "paused"` blocks as `pending`.
- `pending_update_applied` / `pending_update_expired` carry no distinct status — do they do anything
  beyond re-syncing the row?
- **Deletion is unconditional and irreversible — settled, do not re-litigate.** No grace window, no
  soft delete. What is open is the mechanics: cascade findings from
  [04](04-org-delete-cascade-audit.md) decide how many tables the handler touches by hand, and
  whether the deletes need to be ordered or wrapped in a batch.
  **[04](04-org-delete-cascade-audit.md) is closed and the answer is: zero tables by hand.** Every
  child of `organization.id` cascades and D1 enforces FKs by default, so the handler is a single
  `db.delete(organization)`. Two follow-ups land in this ticket instead:
  - `session.active_organization_id` has **no FK** and goes dangling for every member, and
    `resolveOrgStatus` throws `"Organization not found"` rather than redirecting — a 500, not a
    recoverable state. Decide: add an FK with `onDelete: "set null"` (DB is clearable, migration is
    free) vs. an explicit `UPDATE session SET active_organization_id = NULL`, and whether
    `resolveOrgStatus` should degrade to "no org" so the `_authed` gate redirects.
  - Raw `db.delete` bypasses the organization plugin's `beforeDeleteOrganization` /
    `afterDeleteOrganization` hooks. Raw is sufficient today; decide whether to route through the
    plugin API so future external cleanup (Stripe customer, assets) has a home.
- Out-of-order and replayed events: does the handler write unconditionally, or compare against a
  stored version/timestamp? [06](06-subscription-state-model.md) adopted the plugin table **verbatim
  with no added columns** — if ordering needs one (e.g. `lastEventAt`), **this ticket adds it**.
- `resolveBillingStatus` on a **missing org** currently throws (a 500, per
  [04](04-org-delete-cascade-audit.md)). [06](06-subscription-state-model.md) explicitly left this
  here. Decide whether it degrades to "no org" so the `_authed` gate redirects.
- Unknown org on the event (already deleted, metadata missing) — 200 and drop, or 4xx and let Stripe
  retry?
- Signature verification failure and the `STRIPE_WEBHOOK_SECRET` wiring on Workers.
- What the owner is told: is there an email on lapse or deletion, or only the in-app banner?

## Answer

**The handler is stateless and idempotent: for any subscription event, re-retrieve the subscription
from Stripe and write what it says. No ordering column, no per-event branching beyond deletion.**

### 1. Every handler retrieves; the payload supplies only an id

```ts
const sub = await stripe.subscriptions.retrieve(event.data.object.id);
await db.update(subscription).set(fromStripe(sub)).where(...);
```

A replayed or out-of-order event therefore writes **current** truth, not stale truth — ordering
stops mattering by construction. Cost is one extra Stripe API call per event, which is the cheap
side of this trade.

Consequences:

- **No `lastEventAt` column.** [06](06-subscription-state-model.md) held the door open for one; it
  is not needed. The plugin table stays **verbatim**, as 06 specified.
- **`pending_update_applied` / `pending_update_expired` need no branch.** They carry no distinct
  status, so they are plain re-syncs — the generic retrieve-and-write path already covers them.
- Same for `customer.subscription.paused` / `.resumed` (see §4).

### 2. Org deletion — raw `db.delete`, wrapped in a named seam

`customer.subscription.deleted` deletes the org. Per [04](04-org-delete-cascade-audit.md) every
child of `organization.id` cascades and D1 enforces FKs, so this is **zero tables by hand**:

```ts
await db.delete(organization).where(eq(organization.id, orgId));
```

**Not** routed through the plugin's `auth.api.deleteOrganization` — the caller is Stripe, not the
owner, so there is no session to authorize with, and forging one inside a webhook is worse than
losing the hooks. `beforeDeleteOrganization` / `afterDeleteOrganization` simply do not fire; nothing
today needs them.

Put the delete behind `deleteOrganizationCompletely(orgId)` in the billing module so future external
cleanup (Stripe customer deletion, asset purge) has an obvious home that does not depend on plugin
hooks.

Deletion policy itself — unconditional, irreversible, no grace window — was settled on the map and
is untouched here.

### 3. Dangling `session.active_organization_id` — fix it in the schema

Add the FK better-auth's generated schema omits (`src/db/auth-schema.ts:36`):

```ts
activeOrganizationId: text("active_organization_id")
  .references(() => organization.id, { onDelete: "set null" }),
```

The DB clears the pointer atomically with the delete, so no code path can forget it. The dev DB is
clearable, so the migration is free.

**This dissolves the missing-org question [06](06-subscription-state-model.md) handed over.** With
the pointer nulled, `_authed` sees no active org and redirects to `/onboarding/create` before any
billing read happens — `resolveBillingStatus` never sees a deleted org. No degrade path, no tolerant
read, and `resolveOrgStatus`'s current `throw new Error("Organization not found")`
(`src/lib/org-status.ts:50`) has no successor. `resolveBillingStatus` stays the narrow pure read 06
specified.

(Note it would not have thrown anyway: `resolveBillingStatus` queries `subscription` by
`referenceId`, not `organization` — a deleted org yields no row, which 06's table already maps to
`pending`. The FK makes the redirect the _first_ thing that happens, which is the correct UX.)

### 4. `paused` — map on `subscription.status` only

The two things are genuinely different and only one is reachable:

- `status: "paused"` arises **only** when a trial ends with no payment method
  (`trial_settings.end_behavior.missing_payment_method: "pause"`). **We create no trials, so this is
  unreachable in our flow.** 06's table already maps it to `pending` defensively; leave it.
- `pause_collection` is a separate field, set manually from the dashboard. It stops billing and
  **leaves `status: "active"`**.

**Decision: never consult `pause_collection`.** Map purely on `subscription.status`, exactly 06's
table. A paused-collection org therefore stays usable — which is the point of pausing collection: a
manual goodwill or support gesture. Blocking it would lock out the customer we chose to help.

⚠️ Verify during impl with `stripe trigger` / dashboard — these two semantics are the easiest thing
in this map to get backwards.

### 5. Event coverage — no `invoice.*` handlers at all

[01](01-better-auth-stripe-plugin-audit.md) found the plugin handles four events
(`checkout.session.completed`, `customer.subscription.created/.updated/.deleted`) and no
`invoice.*`, leaving dunning to us. **The answer is that dunning needs no code.**

Every payment failure that matters already surfaces as a subscription status change:
`invoice.payment_failed` moves the subscription to `past_due`, which fires
`customer.subscription.updated`, which our retrieve-and-write path handles, which — per
[06](06-subscription-state-model.md) — blocks the org immediately. Subscribing to `invoice.*` would
add a second, redundant route to the same state.

So the Stripe endpoint subscribes to the subscription lifecycle events only. Stripe's own dunning
emails plus the immediate in-app block are the whole feature.

### 6. Unknown org on an event — 200 and drop, logged

[05](05-checkout-architecture.md) set the general rule (throw → non-2xx → Stripe retries ~3 days)
and explicitly handed this arm here. **Org-not-found is exempted:**

```ts
if (!org) {
	console.warn("stripe webhook: org gone", { orgId, event: event.type });
	return new Response(null, { status: 200 });
}
```

Rationale: after an unconditional deletion, org-gone is a **terminal, expected** condition, not a
transient failure — three days of red retries would be noise for something working as designed. 05's
throw-to-retry stands unchanged for genuinely transient cases (DB error, a reference we expected to
resolve and did not).

The guard lives in `onEvent`, same place as 05's — the plugin's own handlers swallow their errors.

### 7. Signature verification — nothing to decide

Settled by [01](01-better-auth-stripe-plugin-audit.md) and [05](05-checkout-architecture.md): the
plugin owns the endpoint and verifies with `constructEventAsync`, and the `workerd` export condition
resolves so no `cryptoProvider` is needed. `STRIPE_WEBHOOK_SECRET` is passed into the plugin config
— we write no verification code.

### 8. Owner communication — in-app banner only

No billing emails from us, on lapse or on deletion. Stripe's dashboard-configured emails cover
failed charges and cancellation. **[03](03-email-password-auth-research.md)'s count of exactly two
new react-email templates (verify email, reset password) therefore holds** — this ticket adds none.

Deletion is silent from our side. Accepted deliberately, alongside the deletion policy.

### Impl checklist this produces

- FK on `session.active_organization_id` → `organization.id`, `onDelete: "set null"` + migration.
- `deleteOrganizationCompletely(orgId)` — single `db.delete(organization)`.
- Generic `syncSubscriptionFromStripe(stripeSubscriptionId)` used by every subscription event.
- `onEvent` guard: org-gone → warn + 200; anything else unresolvable → throw.
- Stripe endpoint event selection: subscription lifecycle + `checkout.session.completed`. No
  `invoice.*`.
- Manual verification: `stripe trigger` for each event, plus a dashboard `pause_collection` check.
