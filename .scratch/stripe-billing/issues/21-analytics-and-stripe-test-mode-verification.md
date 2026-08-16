# 21 — Analytics pass and end-to-end Stripe test-mode verification

Parent: [PRD.md](../PRD.md) §11, §13, §14 Label: `impl` Status: `ready-for-human` Depends on:
[15](15-checkout-page.md), [16](16-webhook-lifecycle.md),
[17](17-payment-required-and-portal-link.md), [19](19-auth-pages.md), [20](20-verify-email-nag.md)

## Goal

Close the loop: the event surface is coherent, and the whole flow is exercised by hand against
Stripe test mode. **There is no automated billing test harness in this repo** and this plan does not
add one beyond [14](14-create-checkout-session.md)'s pure params test — this ticket is that gap's
answer.

## Scope

1. **Analytics sweep.** Confirm every event in PRD §11 fires exactly once with the right props, and
   that `payment_completed` no longer carries `checkout_id` (embedded checkout has none). The
   member/profile/organization events are untouched — verify none broke.
2. **End-to-end manual run**, `stripe listen` + `stripe trigger` against test mode:

   | #   | Step                                          | Expected                                                                                                               |
   | --- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | 1   | Sign up with password → create org → pay      | Row `incomplete` → `active`, lands on `/dashboard`                                                                     |
   | 2   | `customer.subscription.created`               | **Exactly one** row for the org                                                                                        |
   | 3   | Force `past_due`                              | Org blocked, `/payment-required`, portal CTA works                                                                     |
   | 4   | Back to `active`                              | Org usable again                                                                                                       |
   | 5   | `customer.subscription.deleted`               | Org gone, children cascaded, members' `session.active_organization_id` **nulled**, next request → `/onboarding/create` |
   | 6   | Replay each event                             | Same end state (idempotency)                                                                                           |
   | 7   | Event for a deleted org                       | Logged **200**, no retry storm                                                                                         |
   | 8   | Dashboard `pause_collection` on an active sub | Org **stays usable** ⚠️                                                                                                |
   | 9   | Reach checkout with an `active` sub           | 409 → redirected to dashboard                                                                                          |
   | 10  | Abandon checkout, log out, log back in        | Resumes at `/onboarding/checkout`, no bounce loop                                                                      |
   | 11  | Invite a user, accept                         | Straight to `/dashboard`, never sees checkout                                                                          |

   Step 8 is the **single easiest thing in this design to get backwards** — `status: "paused"` and
   `pause_collection` are different fields with opposite intents.

3. **Record the results** in this ticket's Answer section, not just in a terminal.
4. **Document the known limitations** (PRD §14) wherever the repo keeps user-facing notes —
   `CONTEXT.md` or the README. All four are deliberate, and the `BETTER_AUTH_DISABLE_SIGNUP`-breaks-
   invites one in particular will otherwise be filed as a bug.
5. **`CONTEXT.md` vocabulary** from [06](06-subscription-state-model.md): billing status (derived,
   never stored), subscription row (sole source of truth), pending, past due.

## Acceptance

All eleven rows pass and are recorded. Every PRD §14 limitation is written down somewhere a future
maintainer will find it.

## Comments

Analytics sweep (item 1) done in code, found two real mismatches against PRD §11:

- `sign_in_initiated`/`sign_up_initiated` sent `provider: "email"`, spec says `"password"`
  (`src/routes/login.tsx`, `src/routes/signup.tsx`). Fixed.
- `checkout_started` fired with no props at all; spec says `{ organization_id }`
  (`EmbeddedCheckoutSection.tsx`). Fixed — pulls `activeOrg?.id` via
  `authClient.useActiveOrganization()`, same pattern as `ConfirmingCheckout`.

Rest of the surface checked clean: `payment_completed` (ref-guarded, fires once, no `checkout_id`),
`password_reset_requested`/`_completed`, `verification_email_resent`, `billing_portal_opened` (both
`source`s). Member/profile/organization events untouched, all present.

Items 4–5 done: known limitations (PRD §14, all five) written up as
[docs/adr/0002-billing-known-limitations.md](../../../docs/adr/0002-billing-known-limitations.md);
billing vocabulary (billing status, subscription row, pending, past due) added to `CONTEXT.md`.

Item 2–3 (the eleven-row manual `stripe listen`/`stripe trigger` run) **not run this session** — no
Stripe CLI in this environment, and it needs live Stripe test-dashboard interaction. User opted to
run it themselves and report back. `Status` left `ready-for-human` until that table is filled in and
this ticket can close.

Typecheck, lint, format, full test suite (28/28) all pass on the above.

Code review (Standards + Spec) caught two worth fixing: `EmbeddedCheckoutSection`'s `useCallback`
deps held the whole `activeOrg` object rather than `.id`, risking a re-fired checkout-session POST
on an unrelated reference change — narrowed to `activeOrg?.id`. `CONTEXT.md`'s new entries had
drifted into implementation detail (caching policy, CTAs) past the file's own "definitions only"
rule — trimmed back to vocabulary. Left the ADR-not-README location as-is (follows
`docs/agents/domain.md`'s documented structure) and the single bundled ADR file as-is (five tightly
related, PRD-grouped limitations; splitting into five near-empty files seemed worse).
