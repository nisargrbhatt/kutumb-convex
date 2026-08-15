# 06 — Subscription state model and how org status is derived

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
Blocked by: ~~[01](01-better-auth-stripe-plugin-audit.md)~~ (closed) — **unblocked, on the
frontier**

## Question

The map decided subscription state leaves the org `metadata` blob for a real table. Pin the model,
using `/domain-modeling` — the vocabulary lands in `CONTEXT.md`.

- Adopt the plugin's `subscription` table as-is, extend it, or define our own?
  **[01](01-better-auth-stripe-plugin-audit.md) says adopt as-is** — it already carries `plan`,
  `referenceId`, `stripeCustomerId`, `stripeSubscriptionId`, `status` (default `"incomplete"`),
  `periodStart/End`, `trialStart/End`, `cancelAtPeriodEnd`, `cancelAt`, `canceledAt`, `endedAt`,
  `seats`, `billingInterval`, `stripeScheduleId`. It is CLI-generated into our Drizzle schema, then
  a D1 migration. One table only — no parallel sources of truth. What is open: do we need _any_
  added column, and do the trial/seat columns just sit unused (trial and seat metering are both
  ripped out)?
- `referenceId` holds the organization id (`customerType: "organization"`). Note the plugin also
  offers `organization: { enabled: true }`, adding an `organization.stripeCustomerId` column —
  ~~decide whether the customer id lives there, on the subscription row, or both~~ — **settled by
  [05](05-checkout-architecture.md): `organization: { enabled: true }`, the id lives on
  `organization.stripeCustomerId` (canonical, written by an `afterCreateOrganization` hook) and the
  plugin also writes `subscription.stripeCustomerId` — treat that copy as derived.**
- `status` is Stripe's own vocabulary and `incomplete` is the pre-payment default — decide whether
  that is the same thing as the map's "org left in place as `pending`" after an abandoned checkout,
  or a distinct state.
- What stays in org `metadata` afterwards? Today it holds `status`, `trialEndsAt`, `customerId`,
  `subscriptionId`; the trial fields die outright.
- Does `ORGANIZATION_STATUS` survive at all, or is "can this org use the app" derived live from the
  subscription row? If it survives, does it stay `active | pending` and who writes it?
- What is the term for an org that has never paid versus one whose subscription lapsed — is that one
  state (`pending`, one banner) or two (different copy, different CTA)?
- Rewrite target for `src/lib/org-status.ts`: `resolveOrgStatus` currently owns trial arithmetic and
  a lazy write-on-read. With the trial gone, does it become a plain read?
- Caching: `getOrgStatusQuery` polls every 5s while pending. Does that survive, and does the KV
  cache get involved?

## Answer

**Org status is derived live from the `subscription` row. Nothing about billing is stored on the
org.**

### 1. Single source of truth

`subscription` (plugin table, keyed `referenceId = organization.id`) is the only place billing state
lives. There is no `organization.status` column and no status key in `organization.metadata`. The
webhook writes exactly one row; every read derives from it, so there is no drift class of bug.

Read cost is unchanged — `resolveOrgStatus` already did one query per gated request, this only
changes which table it hits. Index `subscription.referenceId`.

### 2. Vocabulary: three states

`ORGANIZATION_STATUS` in `src/db/constants.ts` becomes **`BILLING_STATUS`** with three values:

| App state  | Meaning                    | Banner / CTA                                  |
| ---------- | -------------------------- | --------------------------------------------- |
| `active`   | usable                     | none                                          |
| `pending`  | never successfully paid    | "finish setting up billing" → resume checkout |
| `past_due` | paid once, payment failing | "update your card" → Stripe billing portal    |

`pending` and `past_due` both block, but they earn separate names because the CTA differs — a lapsed
customer needs the card-update portal, **not** a second checkout session. Copy for both is a line
item on [09](09-onboarding-flow-and-gates.md).

### 3. Stripe status → app state (complete mapping)

| `subscription.status` | App state  | Usable  |
| --------------------- | ---------- | ------- |
| _no row at all_       | `pending`  | no      |
| `incomplete`          | `pending`  | no      |
| `incomplete_expired`  | `pending`  | no      |
| `active`              | `active`   | **yes** |
| `trialing`            | `active`   | **yes** |
| `past_due`            | `past_due` | no      |
| `unpaid`              | `past_due` | no      |
| `paused`              | `pending`  | no      |
| `canceled`            | `pending`  | no      |

**`past_due` blocks immediately** — decided against the recommendation. The recommendation was to
treat `past_due` as usable-with-nag and let Stripe's ~3-week smart-retry window act as free dunning,
blocking only at `unpaid`; the trade-off named was that a customer with an expired card loses access
over a retry that would have succeeded. **Confirmed intentional: first failed charge locks the
app.** This is a policy decision, not a mechanism one — do not re-litigate it in
[07](07-webhook-lifecycle-and-org-deletion.md).

`trialing` maps to `active` purely defensively — we create no trials, but a subscription put into
trial from the Stripe dashboard should not lock the org out.

Note the `paused` ambiguity flagged on [07](07-webhook-lifecycle-and-org-deletion.md) (Stripe
`paused` status vs `pause_collection`) is **still 07's to settle** — this table only says that
whichever one lands as `status: "paused"` blocks as `pending`.

### 4. Schema: adopt the plugin table verbatim

Take the better-auth CLI output into Drizzle unedited, then one D1 migration. **No columns added, no
columns removed.**

- `trialStart`, `trialEnd`, `seats`, `stripeScheduleId` sit unused and nullable. Dead columns cost
  nothing on SQLite, and the plugin's own code paths may write them — dropping one turns an internal
  write into a runtime SQL error, and the question returns on every plugin version bump.
- No added columns: `plan` is constant (one flat monthly plan), and the org's Stripe customer id is
  canonical on `organization.stripeCustomerId` per [05](05-checkout-architecture.md).
- `subscription.stripeCustomerId` is a plugin-written **derived copy** — never read it as the
  source.
- If [07](07-webhook-lifecycle-and-org-deletion.md) proves it needs an ordering column (e.g.
  `lastEventAt` for out-of-order events), 07 adds it then. Not pre-emptively.

### 5. Org `metadata` is emptied

All four keys are gone: `status` and `trialEndsAt` die with the trial, `customerId` moves to
`organization.stripeCustomerId`, `subscriptionId` lives on the subscription row. Verified by grep
that no non-billing key exists — `OnboardingForm.tsx:90` writes `metadata: {}`.

**Delete** `OrgMetadata`, `parseOrgMetadata` and `mergeOrgMetadata` (`src/lib/auth.ts:27`) outright.
**Keep** the `metadata` text column (`src/db/auth-schema.ts:97`) — better-auth's organization plugin
owns it, and it stays available for genuine non-billing org config. `OnboardingForm` keeps writing
`{}`.

### 6. No cache on the gate; polling survives, scoped

**Never cache the derived status** — not in KV, not anywhere. It must flip within seconds of a
webhook landing, and a stale read either locks out a paying customer or admits an unpaid one. A
single indexed D1 read per gated request is cheap. The KV binding stays out of this path entirely.

`getOrgStatusQuery`'s 5s poll survives but is **scoped to the post-checkout confirming state**
rather than running app-wide; the `_community` gate reads server-side per navigation as it does
today. [09](09-onboarding-flow-and-gates.md) prototypes that confirming screen and may propose a
server-side Stripe session retrieve as a faster path — that stays 09's call.

### 7. Rewrite target

`src/lib/org-status.ts` → **`src/lib/billing-status.ts`**.

```ts
export type BillingStatus = (typeof BILLING_STATUS)[keyof typeof BILLING_STATUS];
export async function resolveBillingStatus(orgId: string): Promise<BillingStatus>;
```

- Returns the bare status. `ResolvedOrgStatus`, `trialEndsAt`, `inTrial`, `trialDaysLeft` are all
  deleted.
- **Pure read** — the lazy write-on-read that flipped an elapsed trial to `pending` is deleted with
  the trial. `getTrialDays` and `TRIAL_DAYS` go too.
- Interface stays narrow: it returns the status, not the row. If a consumer needs `periodEnd` or
  `cancelAtPeriodEnd` for banner copy, it queries for them — widening this signature waits until
  [09](09-onboarding-flow-and-gates.md) proves a need.
- **Missing org** (`resolveOrgStatus` currently throws `"Organization not found"`, a 500) is
  explicitly **not** settled here — it remains [07](07-webhook-lifecycle-and-org-deletion.md)'s
  call, bundled with the dangling `session.active_organization_id` question from
  [04](04-org-delete-cascade-audit.md).

### Consumers to update (6 call sites)

`src/middleware/payment.ts`, `src/api/organization.ts` (`getOrgStatusQuery`),
`src/routes/_authed/_community.tsx`, `src/routes/_authed/payment-required.tsx`,
`src/routes/_authed/onboarding/success/index.tsx`, `src/lib/auth.ts` (lines 80, 283, 298, 301, 315 —
all metadata status writes, all deleted).

### Domain vocabulary (for `CONTEXT.md`)

- **Billing status** — derived, never stored. The answer to "may this org use the app", computed
  from the org's subscription row on every read.
- **Subscription row** — the single source of truth for billing, one per organization, keyed by
  `referenceId`. Written only by the Stripe webhook and by checkout-session creation.
- **Pending** — an org that has never completed a payment.
- **Past due** — an org that paid at least once and whose payment is now failing.
