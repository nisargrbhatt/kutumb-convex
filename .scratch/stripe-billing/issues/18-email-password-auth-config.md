# 18 — Email/password auth config, rate limiting and the two emails

Parent: [PRD.md](../PRD.md) §9, §10 Label: `impl` Status: `closed` Depends on: _nothing in the
billing chain — can run in parallel from_ [12](12-rip-out-polar-trial-and-seats.md)

## Precondition — do this first

**Deployed scrypt timing test.** [03](03-email-password-auth-research.md) could not verify two
things from source: whether workerd's scrypt runs off-thread, and real latency at `r=16` (~33MB per
hash against a 128MB isolate). Time `POST /sign-up/email` on a **deployed** Worker before building
on top of it. If it is slow enough to threaten the isolate under concurrency, **raise it before
shipping**, not after.

## Scope

1. **`src/lib/auth.ts`**:
   ```ts
   emailAndPassword: {
     enabled: true,
     disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",  // mirrors the Google flag
     requireEmailVerification: false,
     autoSignIn: true,
     minPasswordLength: 8,        // max 128, both better-auth defaults
     sendResetPassword: async ({ user, url }) => { /* ResetPasswordEmail via resend */ },
   },
   emailVerification: { sendOnSignUp: true, sendVerificationEmail: async ({ user, url }) => {...} },
   ```
   **Verification nags, it does not block.** Checkout is compulsory, so a verification wall would
   sit directly on the revenue path and hand deliverability a veto over conversion
   ([08](08-auth-surface-decisions.md)).
2. **Account linking — three rules, do not relax any:**
   - No auto-link. Credential signup on an existing email **422s**; [19](19-auth-pages.md) maps it
     to copy.
   - **`trustedProviders` stays empty.** Google's `email_verified: true` already satisfies the
     linking check; adding Google buys only a bypass of the guard below.
   - 🔒 **`account.accountLinking.requireLocalEmailVerified` stays at its default `true` — never set
     it to `false`.** Verified in `better-auth/dist/oauth2/link-account.mjs:21-22`. It is **the only
     thing** closing the pre-registration takeover vector that nag-mode verification would otherwise
     open. **Version-pinned guarantee: any `better-auth` upgrade must re-verify this default.**
     Leave a comment in `auth.ts` saying so.
3. **Password hashing: do nothing.** `@better-auth/utils` routes to native `node:crypto` scrypt
   under the `workerd` condition, confirmed in our committed build output. **No custom
   `password.hash`/`verify`** — and argon2 is not supported on Workers.
4. **Rate limiting** — the real cost of opening password login. The repo sets **no `rateLimit` and
   no `secondaryStorage`**, so production runs per-isolate memory storage. Add
   `rateLimit: { storage: "secondary-storage" | customStorage }` pointing **only the rate limiter**
   at the existing `KV` binding via a `get`/`set` shim. 🚫 **Not `secondaryStorage`** — that also
   relocates session storage, putting eventual consistency on every request and on logout/session
   revocation, a blast radius far wider than the problem. Accepted: KV eventual consistency gives an
   attacker a few extra tries across colos.
5. **Two react-email templates**, built to `src/emails/InviteEmail.tsx`'s shape (`Tailwind` +
   `pixelBasedPreset`, single `Button` CTA, URL also rendered as plain text) — copy verbatim from
   PRD §10: **`src/emails/VerifyEmail.tsx`**, **`src/emails/ResetPasswordEmail.tsx`**. **No billing
   emails** — none on lapse, none on deletion.
6. `src/lib/auth-client.ts` needs **no change** for this — `signUp.email`, `signIn.email`,
   `resetPassword`, `sendVerificationEmail` are all core. Gotcha for [19](19-auth-pages.md):
   `forgetPassword` is superseded by **`requestPasswordReset`**, and it takes **`redirectTo`** while
   everything else takes `callbackURL`.

## Acceptance

- Signup with email/password creates a user, auto-signs in, sends the verify email, and lands on
  `/onboarding/create` with **no verification wall**.
- Reset flow end to end: request → email → `/reset-password` → sign in with the new password.
- A Google-only user **can** set a password via reset (accepted, not gated).
- `BETTER_AUTH_DISABLE_SIGNUP=1` blocks **both** Google and password signup.
- Hammering `/sign-in/email` trips the limiter, and the counter is visible in KV.
- No new API routes and no DB migration were needed (the `verification` table and `account.password`
  already exist).

## Out of scope

Pages and error copy ([19](19-auth-pages.md)), the verify nag ([20](20-verify-email-nag.md)).

## Comments

Done. `emailAndPassword`/`emailVerification` wired verbatim per §1; account-linking left untouched
(no auto-link code, `trustedProviders` unset, `requireLocalEmailVerified` left at its default with
the required upgrade-watch comment above `emailAndPassword` in `auth.ts`). No password hashing code
added.

Rate limiting: `rateLimit: { customStorage: createKvRateLimitStorage(env.KV) }` in
`src/lib/auth.ts`, shim in new `src/lib/rate-limit-kv.ts` (get/set only, no `consume` — legacy
non-atomic path per better-auth source, matches the "accepted: a few extra tries across colos" cost
in the spec). Namespaced `rate-limit:` prefix, 300s KV TTL (KV floor is 60s; comfortably outlives
better-auth's widest built-in window of 60s). `secondaryStorage` untouched. Unit-tested with a fake
KV (`src/lib/rate-limit-kv.test.ts`) — TDD red→green.

Two new templates, `VerifyEmail.tsx` / `ResetPasswordEmail.tsx`, copied from `InviteEmail.tsx`'s
shape with copy verbatim from PRD §10, URL also rendered as plain text under the button.
`auth-client.ts` untouched, as expected.

Deployed scrypt timing test (the precondition) is a live-Worker ops step, not something this session
can run — flagging it back to the user before this ships, per the ticket's own instruction.

`/code-review` (Standards + Spec, parallel): both clean. Standards axis noted the new
`sendResetPassword`/`sendVerificationEmail` try/catch blocks duplicate the shape of the existing
`sendInvitationEmail` block (three call sites now) — judgement call, not fixed, since it exactly
follows existing sibling-code precedent rather than introducing a new pattern.
