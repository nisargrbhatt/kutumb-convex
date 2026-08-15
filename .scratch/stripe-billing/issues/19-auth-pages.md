# 19 — Auth pages: login, signup, forgot/reset, invite entry

Parent: [PRD.md](../PRD.md) §8.7 · wireframes + copy:
[prototypes/09-screens.md](../prototypes/09-screens.md) Label: `impl` Status: `ready-for-agent`
Depends on: [18](18-email-password-auth-config.md)

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
