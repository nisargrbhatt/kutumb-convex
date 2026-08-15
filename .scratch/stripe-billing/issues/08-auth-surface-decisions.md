# 08 — Auth surface: signup, verification, reset, linking

Parent: [MAP.md](../MAP.md) Label: `wayfinder:grilling` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: ~~[03](03-email-password-auth-research.md)~~ (closed) — **unblocked,
on the frontier**

## Question

Turn the research into product decisions.

- Is email verification **required before sign-in**, or is the account usable while unverified with
  a nag? Required verification inserts a screen between signup and `/onboarding/create` — and, since
  checkout is compulsory, between signup and paying.
- Password policy: min length, any composition rules, and whether the confirm-password field is
  validated client-side only (zod `.refine`) per the brief.
- Google account exists, user signs up with the same email — auto-link, block with "sign in with
  Google instead", or create a separate account? Take the security caveat from
  [03](03-email-password-auth-research.md) seriously.
- Route shape: separate `/login` and `/signup`, plus `/forgot-password`, `/reset-password`,
  `/verify-email`. Or one card that toggles? (Map fog: "Login/signup page composition".)
- Does `BETTER_AUTH_DISABLE_SIGNUP` gate email/password signup too?
- Where do invitees land — an invited user who has no account clicks the invite email and arrives at
  `/onboarding/invitations` while logged out. Does the invite flow prefer signup, and does it
  pre-fill the invited email?
- Which react-email templates are new, and their copy. ([03](03-email-password-auth-research.md)
  says two: verify email, reset password.)

### Added by [03](03-email-password-auth-research.md)

- **Rate-limiting storage — KV vs D1.** The repo sets no `rateLimit` and no `secondaryStorage`, so
  production runs per-isolate memory storage. Google-only login masked this; a public password login
  does not. KV is recommended, **but KV `secondaryStorage` also relocates session storage** — that
  touches every request, not just auth, so it is a bigger call than it looks. Decide here.
- **Signup response shape.** With `requireEmailVerification: true`, signing up on an email that
  already has a Google account returns an enumeration-safe **synthetic unsaved user**, not an error.
  The signup UI has to be written for that — decide the copy, since we deliberately cannot say "that
  email is taken".
- **`trustedProviders` stays empty** (recommended) — confirm. Google's `email_verified: true`
  already links; enabling it bypasses the `emailVerified` check and opens account takeover.
- **Password reset lets a Google-only user set a password** (`password.mjs:152-157`). Accept, or
  gate?

## Answer

**Verification nags, it does not block.** `requireEmailVerification: false`, `autoSignIn: true`,
`emailVerification.sendOnSignUp: true`. Signup goes straight to `/onboarding/create` → checkout.
Rationale: checkout is compulsory, so a verification wall would sit directly on the revenue path and
hand deliverability a veto over conversion. Payment is the real identity proof. Unverified users get
a dismissible in-app nag with a resend action (placement is
[09](09-onboarding-flow-and-gates.md)'s).

This deliberately gives up better-auth's enumeration-safe synthetic-user signup response — with
`requireEmailVerification: false`, credential signup on an existing email returns a plain **422**
(per [03](03-email-password-auth-research.md)). That is what the collision copy below needs, so the
two decisions are consistent: **this design accepts email enumeration end to end.**

**Collision — Google account exists, user signs up with that email:** map the 422 to explicit copy,
_"That email already has an account. Sign in with Google instead."_ No auto-link.

### Account linking — verified against the installed source, not assumed

`node_modules/better-auth/dist/oauth2/link-account.mjs:21-22`: **`requireLocalEmailVerified`
defaults to `true`.** Implicit linking is refused unless the _local_ user row is already verified.

Consequence 1 — **the pre-registration takeover vector is closed by default.** An attacker who
registers a password account on a victim's email (unverified, since we no longer require
verification) does **not** get linked when the victim later signs in with Google; the callback
returns `"account not linked"`. Nag mode is safe from this on the current version. **This is a
version-pinned guarantee** — a better-auth upgrade that changes this default reopens the vector, so
it belongs in the spec as an upgrade watch item.

Consequence 2 — the cost moves to UX, and we **accept it**: a legitimate user who signs up with a
password, ignores the nag, then clicks "Continue with Google" hits that same hard error. Catch it on
the OAuth callback and land on `/login` with: _"That email already has a password account. Sign in
with your password, or verify your email to enable Google sign-in."_ Verification stays optional,
but it is the price of using Google later.

- **`trustedProviders` stays empty** — confirmed. Google's `email_verified: true` already satisfies
  the `!isTrustedProvider && !userInfo.emailVerified` arm; adding Google would only buy a bypass of
  the local-verification check, which is precisely the guard closing Consequence 1.
- **`requireLocalEmailVerified` is left at its default** — never set to `false`.

### Rate limiting — KV via `rateLimit.customStorage`

Point **only the rate limiter** at KV with a `get`/`set` shim over the existing `KV` binding.
Explicitly **not** `secondaryStorage`, which [03](03-email-password-auth-research.md) recommended:
that also relocates session storage, putting eventual consistency on every request and on
logout/session revocation, for a blast radius far wider than the problem. No new D1 table, no
hot-path write. Accepted cost: KV eventual consistency lets an attacker get a few extra tries across
colos — fine for brute-force defence.

### Route shape

Separate routes, not a toggled card — deep-linking matters for the invite flow.

| Route              | Auth   | Notes                                                                     |
| ------------------ | ------ | ------------------------------------------------------------------------- |
| `/login`           | public | Google + email/password. Renders the collision and link-cliff error copy. |
| `/signup`          | public | Hidden behind `BETTER_AUTH_DISABLE_SIGNUP`.                               |
| `/forgot-password` | public | `requestPasswordReset` — takes `redirectTo`, not `callbackURL`.           |
| `/reset-password`  | public | The one genuinely new page per [03](03-email-password-auth-research.md).  |
| `/verify-email`    | —      | **No page.** Self-redirects under `/api/auth/$`.                          |

**Password policy:** min 8, max 128 (better-auth defaults), **no composition rules** — length over
character-class theatre. Confirm-password is client-side only via zod `.refine`, per the brief.

**Invite flow:** the invite email links to **`/login` carrying a `redirectTo`** pointing at the
invitation page. If the user clicks through to `/signup`, `redirectTo` **travels with them**, so
either path lands on the invitation after auth. The email is **not** prefilled — `redirectTo` is the
only thing carried. Whether to prefill is a UI call left to [09](09-onboarding-flow-and-gates.md).

**`BETTER_AUTH_DISABLE_SIGNUP` is a single kill switch across both providers** —
`emailAndPassword.disableSignUp` mirrors the existing Google flag. `/signup` renders a "signups are
closed" state rather than a dead form. **Invite acceptance must keep working while signups are off**
— an explicit check for the impl tickets.

**Password reset for a Google-only user: accepted, not gated.** The link goes to a mailbox they
already control, so it is the owner adding a second credential — and it is the only escape hatch if
they lose Google access.

**Two new react-email templates**, built to `src/emails/InviteEmail.tsx`'s shape (`Tailwind` +
`pixelBasedPreset`, single `Button` CTA): `VerifyEmail.tsx` and `ResetPasswordEmail.tsx`. Copy is a
line item for [10](10-write-spec-and-impl-tickets.md); both are single-action emails with the URL
also rendered as plain text.
