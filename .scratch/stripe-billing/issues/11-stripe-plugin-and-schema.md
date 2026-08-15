# 11 — Stripe SDK, better-auth Stripe plugin and the subscription schema

Parent: [PRD.md](../PRD.md) §3, §5 Label: `impl` Status: `closed` Depends on: _nothing — first
slice_

## Goal

Stripe exists in the app: client constructed, plugin mounted, `subscription` table migrated. Polar
is still wired and still working — this slice adds, it does not remove.

## Scope

1. **Deps.** `stripe@^22`, `@better-auth/stripe` at the version whose peer matches the installed
   `better-auth`, `@stripe/stripe-js@^9`, `@stripe/react-stripe-js@^6`. ⚠️ react-stripe-js v6
   **requires** stripe-js v9 — mixing majors breaks embedded checkout. ⚠️ `@better-auth/stripe` and
   `better-auth` move in lockstep. **Never bump one alone.**
2. **`src/lib/stripe.ts`** — `new Stripe(env.STRIPE_SECRET_KEY, …)` reading from
   `cloudflare:workers`, mirroring today's `src/lib/polar.ts`. **No `httpClient` override** and **no
   `cryptoProvider`**: stripe's `workerd` export condition resolves to `WebPlatformFunctions`
   (SubtleCrypto) under `@cloudflare/vite-plugin`, which [05](05-checkout-architecture.md) verified.
3. **Plugin block in `src/lib/auth.ts`**, alongside the existing `polar()` block:
   - `stripeClient`, `stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET`
   - `createCustomerOnSignUp: false`
   - `subscription: { enabled: true, plans: [...] }` — one plan whose **`priceId` equals
     `env.STRIPE_PRICE_ID`**. The plugin's `resolvePlanItem` matches on it; a mismatch silently
     breaks reconciliation.
   - `customerType: "organization"`, `organization: { enabled: true }`
   - `authorizeReference` — owner-only, per PRD §7.4:
     ```ts
     authorizeReference: async ({ user, referenceId }) =>
     	(await getMember(user.id, referenceId))?.role === "owner";
     ```
     All five actions, no per-action split. **No new `billing` statement in
     `src/lib/permission.ts`** — deliberately out of the access-control layer.
4. **`stripeClient()` in `src/lib/auth-client.ts`**, alongside `polarClient()`.
5. **Schema.** CLI-generate the plugin's `subscription` table into `src/db/auth-schema.ts`
   **verbatim** — no columns added, no columns removed (PRD §5.1). Add the
   `organization.stripeCustomerId` column the plugin declares under
   `organization: { enabled: true }`. Add an **index on `subscription.referenceId`**.
6. **FK on `session.active_organization_id`** (`src/db/auth-schema.ts:36`) — better-auth's generator
   omits it:
   ```ts
   activeOrganizationId: text("active_organization_id")
     .references(() => organization.id, { onDelete: "set null" }),
   ```
   This is load-bearing for [16](16-webhook-lifecycle.md) — it is what makes org deletion safe.
7. **Migration.** `npm run migration:generate`. The DB may be cleared rather than migrated, so do
   not write any backfill.

## Acceptance

- `npm run build` passes; the Worker boots with both plugins mounted.
- Migration applies locally (`npm run migration:migrate:local`) and the `subscription` table matches
  the plugin's declared columns exactly.
- Emitted SQL for `session` carries `ON DELETE SET NULL` on `active_organization_id`.
- `npm run format:fix && npm run lint:fix` clean.

## Out of scope

Removing Polar ([12](12-rip-out-polar-trial-and-seats.md)), checkout creation
([14](14-create-checkout-session.md)), any webhook logic of ours ([16](16-webhook-lifecycle.md)).

## Watch item

Do not "tidy" the unused `trialStart`/`trialEnd`/`seats`/`stripeScheduleId` columns away. The plugin
writes them internally; dropping one turns an internal write into a runtime SQL error
([06](06-subscription-state-model.md) §4).

## Comments

Done. Two deviations from spec, both forced by the installed `@better-auth/stripe` package:

- No `@better-auth/stripe` version peers `better-auth@1.6.14` (lowest published is `1.6.19`, peer
  `^1.6.19`). Bumped both in lockstep to `1.6.29` (latest non-beta pair) — no other option given
  "never bump one alone."
- This version's `StripeOptions` has no top-level `customerType` field — `customerType` is a
  per-request param on the plugin's own endpoints (defaults `"user"`), not a plugin-config default.
  `authorizeReference` lives under `subscription: {...}` (that's where its type is declared), not
  top-level. Mounted `organization: { enabled: true }` as specced; ticket 14's hand-rolled checkout
  will need to pass `customerType: "organization"` itself when calling the plugin's endpoints
  (billing portal etc.).

CLI-generated schema also added `user.stripeCustomerId` (plugin's base schema, unconditional) — kept
verbatim per scope.
