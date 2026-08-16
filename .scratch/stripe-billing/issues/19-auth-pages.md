# 19 — Auth pages: login, signup, forgot/reset, invite entry

Parent: [PRD.md](../PRD.md) §8.7 · wireframes + copy:
[prototypes/09-screens.md](../prototypes/09-screens.md) Label: `impl` Status: `closed` Depends on:
[18](18-email-password-auth-config.md)

## Goal

Four `max-w-sm` cards in `RootLayout` — separate routes, not a toggled card, because deep-linking
matters for the invite flow.

## Scope

1. **`/login`** (rewrite `src/routes/login.tsx`): email + password + `[Sign in]`, "Forgot password?"
   link, divider, `[Continue with Google]`, footer "New here? Create an account" → `/signup`
   **carrying `redirectTo`**.
2. **`/signup`** (new): name, email, password (min 8, **no composition rules** — length over
   character-class theatre), `[Create account]`, divider, Google, footer → `/login` carrying
   `redirectTo`. Confirm-password is **client-side only** via zod `.refine`.
3. **`/forgot-password`** (new): calls **`requestPasswordReset`** — note it takes `redirectTo`, not
   `callbackURL`.
4. **`/reset-password`** (new): consumes the token. **The one genuinely new page** — `/verify-email`
   needs none, better-auth self-redirects under `/api/auth/$`.
5. **Error and empty states — copy verbatim:**

   | Trigger                                       | Copy                                                                                                                                  |
   | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
   | 422 email collision on signup                 | "An account with this email already exists. Sign in instead, or continue with Google." + link                                         |
   | `"account not linked"` on the Google callback | "This email is already registered with a password. Sign in with your password, then verify your email to link Google."                |
   | `BETTER_AUTH_DISABLE_SIGNUP` on               | Form replaced **entirely**: "Signups are closed. Kutumb isn't accepting new accounts right now." + link to `/login` — not a dead form |
   | Reset requested, any email                    | Generic **regardless**: "If that email has a password account, we've sent a reset link."                                              |

   The 422 is deliberate: nag-mode verification gives up better-auth's enumeration-safe
   synthetic-user response, and **this design accepts enumeration on signup** — but reset stays
   generic. The `"account not linked"` cliff is an **accepted** consequence of
   `requireLocalEmailVerified: true`, caught on the OAuth callback and mapped to copy — not a bug to
   "fix" by relaxing that option.

6. **Invite entry:**
   - The invite email links to `/login?redirectTo=/onboarding/invitations&invitation=<id>` — update
     `sendInvitationEmail` in `src/lib/auth.ts`, which today points at `/onboarding/invitations`
     bare.
   - **`redirectTo` and `invitation` are declared search params on both `/login` and `/signup`** and
     are forwarded by the footer links, so either path lands on the invitation after auth.
   - On `/signup?invitation=<id>`: the loader reads the invitation row **server-side** and renders
     the email **prefilled and read-only**, so a created account can never mismatch the invited
     address and orphan the invite.
   - **`BETTER_AUTH_DISABLE_SIGNUP` is absolute — no invite exemption.** While it is on, an invitee
     without an account sees "Signups are closed" and cannot proceed; existing users accept
     normally. Accepted cost of a zero-bypass-surface emergency stop — **document it, do not code
     around it.**
   - Invitees never touch checkout: accepting → `/dashboard`.
7. Analytics: `sign_in_initiated` / `sign_up_initiated` with `{ provider }`,
   `password_reset_requested`, `password_reset_completed`.

## Acceptance

- All four routes render at 320px → ultrawide; pre-session pages carry the wordmark rather than
  breadcrumbs.
- Each of the four error states is reachable and renders the exact copy above.
- An invite link → `/login` → footer → `/signup` **keeps both search params** and lands on
  `/onboarding/invitations` after auth.
- `/signup?invitation=<id>` shows the invited email read-only.
- react-hook-form + zod on every form, per the repo's form convention.

## Comments

Done. Rewrote `/login`, added `/signup`, `/forgot-password`, `/reset-password` — all `max-w-sm`
cards in `RootLayout` (wordmark comes from `Header`, no breadcrumbs, matching prior `/login`).
`react-hook-form` + `Controller` + `zodResolver` on every form, same shape as `OnboardingForm.tsx`.

Search params: `redirectTo`/`invitation`/`error` pulled into one shared
`src/lib/auth-search-params.ts` (`authSearchSchema` + `buildAuthCallbackPath`) so `/login` and
`/signup` can't drift out of sync on the shape footer links and the Google `errorCallbackURL` rely
on. Verbatim copy centralized in `src/lib/auth-copy.ts` for the same reason — two pages render the
`account_not_linked` string, one source avoids a typo-divergence.

Invite prefill: `auth.api.getInvitation` requires a session whose email matches the invitation —
unusable pre-signup, so added `getSignupGateStateFn` (`src/handler/auth.ts`) reading the
`invitation` row directly via `db.query`, gated by the new pure `isInvitationPending` helper
(`src/lib/invitation-preview.ts`, TDD red→green, `invitation-preview.test.ts`). Also returns
`BETTER_AUTH_DISABLE_SIGNUP` state so the `/signup` loader can replace the form entirely — no invite
exemption, checked before the invitation lookup even matters.

`sendInvitationEmail` in `src/lib/auth.ts` now points at
`/login?redirectTo=/onboarding/invitations&invitation=<id>` instead of the bare invitations page.

Error mapping: signup collision and reset-token failures are checked via better-auth's own
`error.code` (`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`, `INVALID_TOKEN` — named constants in
`auth-copy.ts`), not raw HTTP status. `account_not_linked` is the `?error=` value better-auth's
OAuth callback appends (traced through `oauth2/link-account.mjs` → `oauth2/errors.mjs`) when
`requireLocalEmailVerified` blocks an implicit link — both Google buttons pass
`errorCallbackURL: buildAuthCallbackPath(...)` so the failure round-trips back to the originating
page with `redirectTo`/`invitation` intact. Reset-password request always shows the generic copy
regardless of `error`/success (better-auth's own endpoint already returns `status: true` for unknown
emails); a genuine network/API failure on that call still toasts, since that's not the enumeration
case the ticket accepts.

`/code-review` (Standards + Spec, parallel) ran next; both fed back into the diff before this
closed:

- Standards flagged `/login` and `/signup` duplicating the Google button (loading state + click
  handler) and the `account_not_linked` alert almost verbatim — extracted
  `src/components/auth/GoogleAuthButton.tsx` and `OAuthErrorAlert.tsx`, both routes now just pass
  props.
- Standards flagged raw HTTP status checks as primitive obsession — switched to the named
  `error.code` values above.
- Spec flagged `/reset-password` carrying an unspecced `confirmPassword` field (the ticket only asks
  for one on `/signup`) — removed; `/reset-password` is `newPassword` only now.
- Spec flagged a generic "something went wrong with Google" fallback on both pages for any `?error=`
  value outside the 4-row copy table — removed; only `account_not_linked` renders, per spec, via
  `OAuthErrorAlert`.
- Spec flagged the 422 alert's text reading as "...Sign in instead... **Sign in**" (copy already
  says "Sign in instead," then a second "Sign in" link right after) — moved the link into the
  `Alert`'s `AlertAction` corner slot instead of the description flow, so the sentence and the CTA
  don't collide.
- Spec suspected `/reset-password`'s `error` search param was dead code, since `resetPassword` (the
  POST mutation) never sets it — true, but it arrives from a different route:
  `requestPasswordResetCallback` (`GET /reset-password/:token`, the one the emailed link actually
  hits) redirects here with `?error=INVALID_TOKEN` for an already-expired token, before the form
  ever renders. Left as-is, now with a comment on `validateSearch` pointing at the source.
- Standards noted `getSignupGateStateFn` (`src/handler/auth.ts`) didn't short-circuit the invitation
  DB read when signup is disabled — added the early return so the flag alone decides, no needless
  query.

Verified against a local `vite dev` + `wrangler d1 --local`: seeded a real pending invitation row
and confirmed `/signup?invitation=<id>` server-renders the email input `disabled` with the invited
address as `value`; hit `/api/auth/sign-up/email` twice with the same address and got a live 422
(`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`); confirmed `/login`'s footer link carries
`redirectTo`/`invitation` into `/signup`'s href; confirmed `/reset-password` renders the
invalid-link card for a missing token or `?error=`. Did not do a visual cross-breakpoint check in a
real browser (no browser tool available in this session) — layout reuses the same
`Card`/`FieldGroup` primitives and `max-w-sm` shell already relied on elsewhere in the app, but this
is worth a manual pass before shipping.

`npx tsc --noEmit`, `oxlint`, `oxfmt --check`, and the full `vitest` suite are all clean.
