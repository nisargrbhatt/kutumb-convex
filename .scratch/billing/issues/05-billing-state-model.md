# Billing state model

Type: grilling Status: resolved Blocked by: 01, 02, 11

## Question

Where does an org's billing state live and what are its states? Decide: our record (D1 row per org
synced from webhooks vs live Dodo calls, KV cache?), who owns the Trial clock (us or Dodo), the
mapping from Dodo statuses/events to Trial / Active / Grace / Canceled-until-period-end / Locked,
idempotency and out-of-order webhooks, and the single pure function that answers "may this org be
used now?" (pure, in `src/domain`).

## Comments

- From UX research (04): grace length should track Dodo's retry/dunning window (01) so an org is
  never Locked while Dodo still retries. Show a "processing payment" state between checkout return
  and webhook.
- From 01: Dodo statuses `pending|active|past_due|on_hold|paused|cancelled|failed|expired`; no trial
  status (derive from trial dates + `has_payment_method`). Grace = Dodo grace setting (7d `past_due`
  → `on_hold`); `past_due_ends_at` only in webhooks, store it. Retries/dunning are dashboard
  settings. Out-of-order delivery; dedupe on `webhook-id`. Fallback if 11 says no server-side
  card-less subscription: our own trial clock, checkout without trial.
- From 11: server-side card-less sub works → Dodo can own the Trial clock (`next_billing_date` =
  Trial end, `has_payment_method:false`, status `active`). Store `next_billing_date`.

## Answer

Grilled 2026-11-14. ADR `docs/adr/0013-dodo-owns-trial-clock.md`; glossary Subscription/Trial
updated.

1. **Trial clock = Dodo.** Org create also creates the Dodo customer + card-less Subscription
   server-side (`POST /subscriptions`); org create form collects a billing address (fields, Dodo
   down, retries → 06). Store `trialEndsAt = sub.created_at + trial_period_days` once
   (`next_billing_date` moves after renewals, never the source).
2. **Storage:** one D1 `orgBilling` row per org: `organizationId`, `dodoCustomerId`,
   `subscriptionId?`, `status` (raw Dodo), `trialEndsAt`, `nextBillingDate`,
   `cancelAtNextBillingDate`, `pastDueEndsAt?`, `hasPaymentMethod`, `needsSubscription`, `syncedAt`.
   Webhook-synced; no live Dodo reads on the access path. KV caching → 07.
3. **Webhooks:** dedupe table keyed by `webhook-id`. Any `subscription.*` / `payment.*` event →
   `subscriptions.retrieve(id)` → overwrite row (order-independent, latest Dodo state wins). Same
   pull on return from checkout / portal.
4. **States** `pending | trialing | active | canceling | grace | locked`:
   - `pending`: sub exists, not yet confirmed (e.g. re-subscribe checkout return). Not locked.
   - `trialing`: status `active`, `now < trialEndsAt`; carries `hasPaymentMethod` (card added
     mid-Trial stays `trialing`, banner → "First charge $5 on <date>").
   - `active`: status `active`, past Trial.
   - `canceling`: `active` + `cancelAtNextBillingDate`, until `nextBillingDate`; wins over
     `trialing` (cancel in Trial → "access until <Trial end>").
   - `grace`: `past_due`, until `pastDueEndsAt`.
   - `locked` + `lockReason`: `trial_ended` (`on_hold`, no card), `payment_failed` (`on_hold` with
     card, or `past_due` past its end), `canceled` (`cancelled|expired|failed|paused`, or
     `canceling` past its date).
   - No sub (Dodo create failed): `trialing` from `org.createdAt + 15d`, `needsSubscription`; then
     `locked`/`trial_ended`.
5. **Pure fn:**
   `billingAccess(row, now) → { state, locked, lockReason?, trialDaysLeft?, graceEndsAt?, accessEndsAt? }`
   in `src/domain/billing.ts`; time injected, no IO; used by UI banners, Lock seam (07), reminders
   (09). Exhaustive unit tests.
6. **History:** current subscription id only; re-subscribe (after terminal) = new checkout with
   `trial_period_days: 0` (no second Trial), replaces the id.
