# 10 — Write the spec and the implementation tickets

Parent: [MAP.md](../MAP.md) Label: `wayfinder:task` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: ~~[05](05-checkout-architecture.md)~~ (closed),
~~[06](06-subscription-state-model.md)~~ (closed),
~~[07](07-webhook-lifecycle-and-org-deletion.md)~~ (closed), ~~[08](08-auth-surface-decisions.md)~~
(closed), ~~[09](09-onboarding-flow-and-gates.md)~~ (closed) — **unblocked, on the frontier. Last
ticket on the map.**

## Question

The destination. With every decision closed, write `.scratch/stripe-billing/PRD.md` via `/to-prd`,
then break it into implementation issues via `/to-issues` as tracer-bullet vertical slices under
`.scratch/stripe-billing/issues/` (numbering continues from this map's tickets — impl issues start
at `11`).

The spec must cover, each pointing at the ticket that decided it:

- Polar removal inventory (deps, `src/lib/polar.ts`, the plugin block in `src/lib/auth.ts`,
  `polarClient()` in `auth-client.ts`, `src/routes/api/polar/portal.ts`, the `AuthUser.tsx` link,
  seat-metering hooks, trial machinery in `org-status.ts` and `ORGANIZATION_STATUS`).
- Env vars and secrets, including the new client-side publishable key.
- Drizzle schema change + migration, and the note that the dev DB is cleared rather than migrated.
- Server surface: checkout session creation, webhook route, billing portal route.
- Client surface: checkout page, payment-required banner, login, signup, forgot/reset, verify.
- Auth config diff.
- **Analytics** (graduated from map fog by [07](07-webhook-lifecycle-and-org-deletion.md)): which
  PostHog events survive and under what names — `payment_completed`, `sign_in_initiated`, plus
  anything the new signup/verify/reset pages warrant. Small, spec-level, no decision left.
- Schema deltas [07](07-webhook-lifecycle-and-org-deletion.md) added beyond the subscription table:
  the `session.active_organization_id` FK (`onDelete: "set null"`).
- **Auth spec items from [08](08-auth-surface-decisions.md):** the `rateLimit.customStorage` KV shim
  (explicitly not `secondaryStorage`); copy for the two new react-email templates (`VerifyEmail`,
  `ResetPasswordEmail`); and an **upgrade watch item** — better-auth's
  `account.accountLinking.requireLocalEmailVerified` default of `true` is what makes nag-mode
  verification safe from pre-registration account takeover. If a future upgrade flips that default,
  the vector reopens. Pin it in the spec and never set the option to `false`.
- The **deployed scrypt timing test** against `/sign-up/email` that
  [03](03-email-password-auth-research.md) could not verify (workerd off-thread? latency at `r=16`?)
  — a precondition on the auth impl ticket.
- **From [09](09-onboarding-flow-and-gates.md):** the prototype at
  [prototypes/09-screens.md](../prototypes/09-screens.md) is the client-surface source of truth —
  route table, gate branches, wireframes and copy strings lift into the spec directly. Add to the
  removal inventory: `/onboarding/success` route and `PaymentRequiredBanner.tsx`, both deleted.
  Document as a known limitation that **`BETTER_AUTH_DISABLE_SIGNUP` breaks invites for users
  without accounts** — deliberate, not a bug. Portal link is **owners only**.
- Manual verification steps against Stripe test mode (`stripe listen`/`trigger` for the seven
  events), since there is no automated billing test harness in the repo.

Every impl issue lands `Status: ready-for-agent` and is small enough for one agent session.

## Answer

**Destination reached.** [`PRD.md`](../PRD.md) is written and broken into **eleven** impl issues,
`11`–`21`, each `Status: ready-for-agent` and sized for one agent session.

Every bullet this ticket listed is covered: Polar removal inventory (PRD §12, with a
`grep -ri polar` acceptance check on [12](12-rip-out-polar-trial-and-seats.md)), env vars (§4 — none
new, five Polar vars plus `TRIAL_DAYS` deleted), schema + migration and the cleared-DB note (§5),
server surface (§7), client surface (§8, lifted from
[prototypes/09-screens.md](../prototypes/09-screens.md)), auth config diff (§9), analytics (§11),
[07](07-webhook-lifecycle-and-org-deletion.md)'s `session.active_organization_id` FK (§5.2),
[08](08-auth-surface-decisions.md)'s KV `rateLimit.customStorage` shim, the two email templates with
copy (§10) and the `requireLocalEmailVerified` upgrade watch item (§9, flagged 🔒 and repeated on
[18](18-email-password-auth-config.md)), the deployed scrypt timing test (a **precondition** at the
top of [18](18-email-password-auth-config.md)), `/onboarding/success` + `PaymentRequiredBanner`
deletion, the `BETTER_AUTH_DISABLE_SIGNUP`-breaks-invites limitation (§14), owners-only portal, and
manual Stripe test-mode verification ([21](21-analytics-and-stripe-test-mode-verification.md), 11
rows).

### The slices

| #                                                       | Slice                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- |
| [11](11-stripe-plugin-and-schema.md)                    | Stripe SDK, plugin, subscription schema, `session` FK       |
| [12](12-rip-out-polar-trial-and-seats.md)               | Rip out Polar, trial, seat metering; Stripe customer hook   |
| [13](13-billing-status-and-gates.md)                    | `resolveBillingStatus` + the three-way gates                |
| [14](14-create-checkout-session.md)                     | `createCheckoutSession`, metadata contract, duplicate guard |
| [15](15-checkout-page.md)                               | `/onboarding/checkout` + confirming state                   |
| [16](16-webhook-lifecycle.md)                           | Webhook lifecycle, org deletion, `onEvent` guards           |
| [17](17-payment-required-and-portal-link.md)            | `/payment-required` + portal link                           |
| [18](18-email-password-auth-config.md)                  | Auth config, rate limiting, two emails                      |
| [19](19-auth-pages.md)                                  | Login, signup, forgot/reset, invite entry                   |
| [20](20-verify-email-nag.md)                            | Verify-email nag                                            |
| [21](21-analytics-and-stripe-test-mode-verification.md) | Analytics + end-to-end test-mode run                        |

Dependency spine: `11 → 12 → 13 → 14 → 15/16 → 21`, with `17` off `13`, and the auth chain
`18 → 19/20` running in parallel from `12`.

### Two judgement calls made while writing

- **`11` bundles the plugin _and_ the schema** rather than splitting them. The plugin will not boot
  without its table, so a split leaves a slice that cannot be verified.
- **`12` and `13` are a declared pair.** Ripping Polar out leaves the app briefly incoherent — the
  ticket says so explicitly rather than pretending each stands alone.

Each ticket repeats the two or three facts that will silently break it if forgotten (the
`embedded_page` literal, the undocumented metadata bags, `pause_collection` vs `status: "paused"`,
`requireLocalEmailVerified`) — an implementing agent reads one ticket, not the whole map.
