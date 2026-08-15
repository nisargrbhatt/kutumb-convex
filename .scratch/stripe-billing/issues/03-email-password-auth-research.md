# 03 — Email/password, verification and reset in better-auth

Parent: [MAP.md](../MAP.md) Label: `wayfinder:research` Status: `closed` Assignee: Nisarg Bhatt
(wayfinder session) Blocked by: _nothing_

## Question

What does enabling email/password alongside the existing Google provider actually require?

Current state: `emailAndPassword: { enabled: false }` in `src/lib/auth.ts`, Google is the only
provider, `BETTER_AUTH_DISABLE_SIGNUP` gates Google signup, Resend + react-email already wired
(`src/lib/resend.ts`, `src/emails/InviteEmail.tsx`).

1. **Config.** The `emailAndPassword` options that matter: `requireEmailVerification`,
   `minPasswordLength`/`maxPasswordLength`, `autoSignIn`, `sendResetPassword`,
   `sendVerificationEmail` (which sits under `emailVerification`), and the password hashing default
   on Workers (is the default scrypt implementation Workers-safe, or is a custom `password.hash`
   needed?).
2. **Client.** `authClient.signUp.email`, `signIn.email`, `forgetPassword`, `resetPassword`,
   `sendVerificationEmail` signatures and their callback URL params.
3. **Account linking.** A user who signed in with Google and later signs up with the same email —
   what better-auth does by default, and what `account.accountLinking.trustedProviders` changes.
   Include the security caveat (unverified email + auto-link = account takeover).
4. **Verification tokens.** Which routes handle `/verify-email` and `/reset-password` callbacks, the
   token TTL, and whether better-auth mounts them under the existing `/api/auth/$` catch-all (it
   should) or needs app routes for the UI landing pages.
5. **Signup gating.** How `BETTER_AUTH_DISABLE_SIGNUP` should apply to email/password signup —
   better-auth has `disableSignUp` per social provider; is there an equivalent for
   `emailAndPassword`?
6. **Rate limiting.** What better-auth gives out of the box for signin/signup/reset endpoints, and
   what `/better-auth-security-best-practices` recommends adding for a public password login.

## Answer

Full findings: [research/03-email-password-auth.md](../research/03-email-password-auth.md).

**Headline: far cheaper than feared. No custom password hashing, no new API routes, no DB migration.
The one real cost is a pre-existing rate-limiting gap that email/password makes load-bearing.**

1. **Hashing on Workers — resolves in our favour, verified empirically.** `@better-auth/utils@0.4.1`
   ships a `workerd` export condition routing to native `node:crypto` scrypt (upstream issues
   [#8860](https://github.com/better-auth/better-auth/issues/8860) /
   [#8456](https://github.com/better-auth/better-auth/issues/8456), both closed). Confirmed in our
   own **committed build output** — `dist/server/assets/auth-CLM9vu4M.js:6` contains
   `import { randomBytes, scrypt } from "node:crypto"`. **No custom `password.hash`/`verify`
   needed**; `nodejs_compat` and our compat date already satisfy the preconditions. Caveats: params
   are `N=16384, r=16` (~33MB per hash against a 128MB isolate — a concurrency watch item), and
   argon2 is **not** supported on Workers.
2. **False alarm cleared:** `better-auth/minimal` means "without Kysely", not a reduced feature set.
   No change needed.
3. **Client.** `signUp.email`, `signIn.email`, `resetPassword`, `sendVerificationEmail` are all
   core; `src/lib/auth-client.ts` needs no change. Two gotchas: `forgetPassword` is superseded by
   **`requestPasswordReset`**, and it takes `redirectTo` while everything else takes `callbackURL`.
4. **Account linking — the source contradicts the docs prose; trust the source.** Credential signup
   on an existing email does **not** auto-link. It 422s, or — with `requireEmailVerification: true`
   — returns an enumeration-safe **synthetic unsaved user**. The signup UI must be written for that
   response. `trustedProviders` governs only the OAuth direction and bypasses the `emailVerified`
   check (takeover risk); **recommend leaving it empty**, since Google's `email_verified: true`
   already links.
5. **Routes and storage — nothing new.** Everything mounts under the existing `/api/auth/$`
   catch-all. **No new API routes and no DB migration** — the `verification` table and
   `account.password` column already exist. Both token TTLs default to 1h. Exactly **one** app page
   is genuinely required: a public `/reset-password`. `/verify-email` self-redirects.
6. **Signup gating — direct mirror.** `emailAndPassword.disableSignUp` mirrors the existing Google
   flag, so `BETTER_AUTH_DISABLE_SIGNUP` stays a single kill-switch across both providers.
7. **Rate limiting — pre-existing gap, now load-bearing.** Defaults are reasonable (3 per 10s on
   sign-in/sign-up), but the repo sets **no `rateLimit` and no `secondaryStorage` at all**, so
   production runs per-isolate memory storage — near-useless on Workers. Google-only login masked
   this; a public password login does not. Recommend KV via `secondaryStorage` (native TTL, already
   bound) over D1 (`"database"` needs a new `rateLimit` table plus hot-path writes).

### Decisions this hands to [08](08-auth-surface-decisions.md)

- `requireEmailVerification: true` — and accept the synthetic-user signup UX that comes with it.
- **KV vs D1 for rate limiting. Note KV `secondaryStorage` also relocates session storage** — a
  broader change than it first looks, and it touches every request, not just auth.
- Accept that password reset lets a Google-only user set a password (source:
  `password.mjs:152-157`).
- `/verify-email` landing page, or plain redirect?
- Two new react-email templates (verify email, reset password) alongside `InviteEmail`.

### Could not verify

Whether workerd's scrypt runs off-thread, and real-world latency at `r=16`. **One deployed timing
test against `/sign-up/email` closes both cheaply** — worth doing before implementation, and a
candidate impl-ticket precondition for [10](10-write-spec-and-impl-tickets.md).
