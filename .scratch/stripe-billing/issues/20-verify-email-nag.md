# 20 — Verify-email nag in `CommunityLayout`

Parent: [PRD.md](../PRD.md) §8.6 · wireframe:
[prototypes/09-screens.md](../prototypes/09-screens.md) Label: `impl` Status: `closed`
Depends on: [18](18-email-password-auth-config.md)

## Goal

Verification no longer blocks, so unverified users reach the full app. They get a nag.

## Scope

- A dismissible bar at the **top of `CommunityLayout`**, rendering only when
  `session.user.emailVerified === false`: "✉ Verify your email to secure your account. `[Resend]`
  `[×]`"
- `[Resend]` calls better-auth's send-verification-email, **disabled with a 60s cooldown** after a
  send; toast confirms.
- `[×]` dismisses **per session** (`sessionStorage`) — it returns next login.
- Wraps to two lines on mobile rather than truncating.
- Analytics: `verification_email_resent`.

## Why it goes here specifically

[08](08-auth-surface-decisions.md) asked how an unverified user in `past_due` avoids two stacked
banners. The answer is structural, not a rule: billing states are **full-page routes outside
`CommunityLayout`**, so a nag placed inside it is **incapable** of rendering beside one. Putting
this anywhere else re-opens a problem that is currently impossible
([09](09-onboarding-flow-and-gates.md)).

## Acceptance

- Verified users never see it.
- Dismiss survives navigation within the session and returns on next login.
- `[Resend]` is disabled for 60s after a send.
- It cannot appear on `/onboarding/checkout` or `/payment-required`.

## Comments

Done. New `VerifyEmailNag.tsx` in `CommunityLayout/`, mounted at top of `CommunityLayout`'s `<main>`.
No exclusion logic needed for checkout/payment-required — structurally outside `CommunityLayout`
already, per 09.

`dismissed` state read via a lazy `useState` initializer off `sessionStorage`, not an effect — safe
because `authClient.useSession()` itself returns `undefined` through SSR and the first hydration
pass, so the nag already renders `null` until session resolves client-side; no hydration mismatch
risk from reading `sessionStorage` synchronously at that point.

Code review flagged `posthog.capture("verification_email_resent")` firing before the send call
resolved (would fire even on failure) — moved after the `error` check so it only fires on confirmed
send, matching the rest of `handleResend`'s success-gating.
