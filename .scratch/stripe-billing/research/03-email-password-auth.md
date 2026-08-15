# 03 — Email/Password Auth Alongside Google (better-auth 1.6.14 on Workers)

Research for ticket `.scratch/stripe-billing/issues/03-email-password-auth-research.md`.

**Verified against:** installed source at `node_modules/better-auth@1.6.14`,
`node_modules/@better-auth/utils@0.4.1`, the compiled worker bundle at
`dist/server/assets/auth-CLM9vu4M.js`, and better-auth / Cloudflare official docs. Source-code line
refs are the strongest evidence here — they describe _the exact version installed_, not "latest
docs".

---

## 0. Preflight: `better-auth/minimal` is not a reduced feature set

`src/lib/auth.ts:2` imports `betterAuth` from `better-auth/minimal`. This was a worry (does minimal
strip email/password?). It does not.

`node_modules/better-auth/dist/auth/minimal.mjs`:

```js
/** Better Auth initializer for minimal mode (without Kysely) */
const betterAuth = (options) => createBetterAuth(options, initMinimal);
```

"Minimal" = **without the bundled Kysely adapter** (we use `drizzleAdapter`, so it is the correct
entry). All core routes — including `/sign-up/email`, `/sign-in/email`, `/verify-email`,
`/reset-password` — are part of the core `api/routes` set and are unaffected. No change needed.

---

## 1. Config — and the Workers password-hashing question

### 1a. Password hashing on Workers — **the default is safe on this repo. Verified empirically.**

This was the highest-risk unknown, and the answer changed recently. Full chain:

**Historically broken.** better-auth's password module used `@noble/hashes/scrypt` (pure JS)
unconditionally. On Workers this intermittently blew the CPU budget:
[better-auth#8860 "email/password sign-up exceeds CPU time limit on Cloudflare Workers"](https://github.com/better-auth/better-auth/issues/8860)
(reported against 1.4.18) — "the pure JavaScript scrypt from `@noble/hashes` is right on the edge of
Workers' CPU budget, sometimes finishing and sometimes not." The documented workaround was a custom
`emailAndPassword.password.hash/verify` using native `node:crypto.scryptSync`.

**Fixed upstream.** [better-auth#8456](https://github.com/better-auth/better-auth/issues/8456) ("use
native node:crypto scrypt for Cloudflare Workers support") is **closed**, via
`better-auth/utils#16`. Cloudflare had meanwhile shipped `scrypt`/`scryptSync` in `node:crypto`
([Cloudflare changelog, node:crypto](https://developers.cloudflare.com/changelog/2025-04-08-nodejs-crypto-and-tls/)).

**The fix is present in our installed tree.** `@better-auth/utils@0.4.1` `package.json` now carries
an explicit **`workerd` export condition**:

```json
"./password": {
  "workerd": { "import": "./dist/password.node.mjs", "require": "./dist/password.node.cjs" },
  "node":    { "import": "./dist/password.node.mjs", "require": "./dist/password.node.cjs" },
  "import":  "./dist/password.mjs",
  "require": "./dist/password.cjs"
}
```

`dist/password.node.mjs` uses `import { randomBytes, scrypt } from 'node:crypto'`;
`dist/password.mjs` is the slow `@noble/hashes` fallback.

**And the bundler actually resolves it.** This is the part worth trusting over inference — I checked
the committed build output rather than assuming `@cloudflare/vite-plugin` sets the condition.
`dist/server/assets/auth-CLM9vu4M.js` line 6:

```js
import { randomBytes, scrypt } from "node:crypto";
```

…and the bundled `generateKey`/`hashPassword` at ~line 12227 is verbatim the `password.node.mjs`
body, immediately followed by the `//#region node_modules/better-auth/dist/crypto/password.mjs`
marker. So the native path is what ships. (`@noble` does appear elsewhere in the bundle — it backs
other crypto in better-auth — so a bare `grep noble` is misleading here.)

**Conclusion: no custom `password.hash`/`password.verify` is required.** Two preconditions must
hold, and both already do in this repo:

- `nodejs_compat` flag — present (`wrangler.jsonc`), compat date `2026-02-24` (docs require ≥
  `2024-09-23`).
- Bundler honours the `workerd` condition — confirmed above.

**Residual caveats (flag, don't block):**

- Params are `N: 16384, r: 16, p: 1, dkLen: 64` (`password.node.mjs`). Note `r: 16`, double the
  conventional `r: 8`. Memory per hash = `128 * N * r` ≈ **33.5 MB**; `maxmem` is set to 2× that
  (~67 MB). A Workers isolate has a **128 MB** limit, so a handful of _concurrent_ password hashes
  in one isolate could plausibly hit memory pressure. Native scrypt is C++ so per-op CPU is fine;
  concurrency is the theoretical risk. Could not verify a real-world OOM report for this — treat as
  "watch", not "known bug".
- Do **not** reach for argon2 as an alternative: Cloudflare docs state "`argon2` and `argon2Sync`
  are not supported"
  ([node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)).
- If we ever change hash params, existing hashes are `salt:key` hex and are not self-describing —
  there is no algorithm/params prefix, so a param change silently invalidates every stored password.
  Pin the defaults.

### 1b. `emailAndPassword` options that matter

Per
[docs/authentication/email-password](https://www.better-auth.com/docs/authentication/email-password),
cross-checked against source:

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: false,                 // see §5
  minPasswordLength: 8,                 // default
  maxPasswordLength: 128,               // default
  autoSignIn: true,                     // default
  requireEmailVerification: false,      // default
  revokeSessionsOnPasswordReset: false, // default
  resetPasswordTokenExpiresIn: 3600,    // seconds; default confirmed in source
  sendResetPassword: async ({ user, url, token }, request) => {},
  onPasswordReset: async ({ user }, request) => {},
  onExistingUserSignUp: async ({ user }, request) => {},
  password: { hash, verify },           // NOT needed — see §1a
}
```

`min`/`maxPasswordLength` are enforced on both signup (`api/routes/sign-up.mjs:151-160`) and reset
(`api/routes/password.mjs:143-146`).

`emailVerification` is a **separate top-level block**, not nested under `emailAndPassword`:

```ts
emailVerification: {
  sendVerificationEmail: async ({ user, url, token }, request) => {},
  sendOnSignUp: true,
  autoSignInAfterVerification: true,
  expiresIn: 3600, // seconds, default — see §4
}
```

Recommended for this repo: `requireEmailVerification: true` + `sendOnSignUp: true`. Note
`requireEmailVerification: true` also changes the duplicate-signup response shape (§3) — that is a
feature, not a side effect.

---

## 2. Client methods

`src/lib/auth-client.ts` needs **no change** — these are core methods, present on the base client
without extra plugins. Signatures
([docs](https://www.better-auth.com/docs/authentication/email-password)):

```ts
await authClient.signUp.email({ name, email, password, image?, callbackURL? });
await authClient.signIn.email({ email, password, rememberMe?, callbackURL? });
await authClient.requestPasswordReset({ email, redirectTo });
await authClient.resetPassword({ newPassword, token });
await authClient.changePassword({ newPassword, currentPassword, revokeOtherSessions? });
await authClient.sendVerificationEmail({ email, callbackURL });
await authClient.verifyEmail({ query: { token } });
```

**Naming note:** the ticket asks about `forgetPassword`. In 1.6.14 the canonical endpoint is
**`/request-password-reset`** → `authClient.requestPasswordReset`. `/forget-password` still appears
as a legacy path in the rate-limiter's default matcher (`api/rate-limiter/index.mjs:194`), so the
old alias is at minimum still routed, but `requestPasswordReset` is what the docs and route
definitions use (`api/routes/password.mjs:20`). **Use `requestPasswordReset`.**

Careful on the param name asymmetry — it is a real footgun: `requestPasswordReset` takes
**`redirectTo`**, while every other method takes **`callbackURL`**.

---

## 3. Account linking — default behaviour is **safer than the docs prose implies**

The ticket's scenario: user signs in with Google, then signs up with the same email via
email/password. I checked the source rather than trusting the docs summary, and they disagree — the
docs page reads as though credential signup auto-links into the existing Google user. **In 1.6.14 it
does not.**

`api/routes/sign-up.mjs:165-207` — on `POST /sign-up/email` with an existing email, there is no
linking branch at all. Two outcomes:

- **Default** (`requireEmailVerification: false` and `autoSignIn !== false`): throws
  `422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
- **If `requireEmailVerification: true` OR `autoSignIn: false`**
  (`shouldReturnGenericDuplicateResponse`): returns `{ token: null, user: <synthetic> }` — a
  fabricated in-memory user that is **never persisted** — plus a throwaway `password.hash(password)`
  purely to flatten the timing signal. This is deliberate **user-enumeration protection**.

So an attacker cannot mint a password on someone's Google account via signup. Since we want
`requireEmailVerification: true` anyway, we get the enumeration-safe branch for free — but **the UI
must handle a "success" response that did not actually create an account**. Do not tell the user
"check your inbox" in a way that is falsifiable; the generic-response design assumes a generic
message.

**`account.accountLinking` governs the _other_ direction** — an OAuth callback linking into an
existing user. Authoritative guard, `oauth2/link-account.mjs:20-22`:

```js
const isTrustedProvider =
	opts.isTrustedProvider || c.context.trustedProviders.includes(account.providerId);
const requireLocalEmailVerified = accountLinking?.requireLocalEmailVerified ?? true;
if (
	(!isTrustedProvider && !userInfo.emailVerified) ||
	(requireLocalEmailVerified && !dbUser.user.emailVerified) ||
	accountLinking?.enabled === false ||
	accountLinking?.disableImplicitLinking === true
) {
	return { error: "account not linked", data: null };
}
```

Read carefully, linking proceeds only if **(provider is trusted OR the provider asserted
`emailVerified`) AND (the local user's email is already verified, unless
`requireLocalEmailVerified: false`)**.

Consequences for us:

- Account linking is **enabled by default**.
- Google always returns `email_verified: true`, so a Google sign-in links into an existing verified
  credential user without adding `google` to `trustedProviders`. **We likely do not need
  `trustedProviders` at all.**
- `requireLocalEmailVerified` defaults to `true` — a password user who never verified will get
  `account not linked` on Google sign-in. This is the most likely support ticket from this change.
  Enforcing verification (§1b) keeps users out of that state.
- **Security caveat, as the ticket suspected:** `trustedProviders` bypasses the
  `!userInfo.emailVerified` check. Adding a provider that does not verify email ownership lets an
  attacker register that provider with a victim's address and auto-link into the victim's account.
  Docs: "Use this with caution as it may increase the risk of account takeover"
  ([users-accounts](https://www.better-auth.com/docs/concepts/users-accounts)). Recommendation:
  **leave `trustedProviders` empty.**

**Non-obvious behaviour worth a decision** — `api/routes/password.mjs:152-157`: the reset-password
handler _creates_ a `credential` account if none exists:

```js
if (
	!(await ctx.context.internalAdapter.findAccounts(userId)).find(
		(ac) => ac.providerId === "credential"
	)
)
	await ctx.context.internalAdapter.createAccount({
		userId,
		providerId: "credential",
		password: hashedPassword,
		accountId: userId,
	});
else await ctx.context.internalAdapter.updatePassword(userId, hashedPassword);
```

So **"forgot password" is the supported way a Google-only user adds a password** — signup is
blocked, but reset works and is gated on inbox possession. Defensible, but it means anyone who can
read a user's email can add a password credential. Consider `revokeSessionsOnPasswordReset: true` to
limit the blast radius.

---

## 4. Verification & reset routes, token TTLs

**Everything is mounted under the existing `src/routes/api/auth/$.ts` catch-all.** It already
forwards GET and POST to `auth.handler`, which is all these flows need. **No new API routes.**
Confirmed present in 1.6.14: `/sign-up/email`, `/sign-in/email`, `/verify-email`,
`/send-verification-email`, `/request-password-reset`, `/reset-password`, `/reset-password/:token`.

### Password reset (`api/routes/password.mjs`)

- TTL: `resetPasswordTokenExpiresIn || 3600 * 1` seconds → **1 hour default** (:64).
- Token = `generateId(24)`, stored in the **`verification` table** under identifier
  `reset-password:<token>` (:65-70).
- Emailed URL: `${baseURL}/reset-password/${token}?callbackURL=${encoded redirectTo}` (:72).
- `GET /reset-password/:token` validates + expiry-checks, then **redirects to our page** as
  `callbackURL?token=<token>`, or `callbackURL?error=INVALID_TOKEN` (:112-118).
- Our page then calls `authClient.resetPassword({ newPassword, token })`.
- **→ We need one app route: `/reset-password`** (reads `?token` / `?error`, renders the
  new-password form). Must be public (outside `_authed`).

### Email verification (`api/routes/email-verification.mjs`)

- TTL: `createEmailVerificationToken(..., expiresIn = 3600)` → **1 hour default**, overridable via
  `emailVerification.expiresIn` (:12, :27).
- Token is a **signed JWT** (signed with `BETTER_AUTH_SECRET`), **not** a DB row — unlike reset
  tokens. Nothing to clean up.
- Emailed URL: `${baseURL}/verify-email?token=${token}&callbackURL=${encoded}` (:29).
- `GET /verify-email` verifies then **redirects to `callbackURL`**, appending `?error=<code>` /
  `&error=<code>` on failure (:153-155).
- **→ No dedicated app route strictly required** — point `callbackURL` at `/dashboard` or `/login`.
  A small `/verify-email` landing page is nicer for rendering the `?error=` case. Optional.

### Origin checks

Both `redirectTo` and `callbackURL` pass through `originCheck` middleware (`password.mjs:40,87`;
`email-verification.mjs:117`). Relative paths (`/reset-password`) are safest. The repo sets
`baseURL` but no `trustedOrigins`; if we ever pass absolute URLs, `trustedOrigins` must be
configured or the redirect is rejected.

### Schema

**No migration needed.** `src/db/auth-schema.ts` already has the `verification` table (:71) and
`account.password` (:60) — better-auth's standard schema, unused so far only because
`enabled: false`.

---

## 5. Signup gating — `BETTER_AUTH_DISABLE_SIGNUP`

Yes, there is a direct equivalent. `emailAndPassword.disableSignUp` mirrors the per-provider
`socialProviders.google.disableSignUp` already used at `src/lib/auth.ts:343`:

```ts
emailAndPassword: {
  enabled: true,
  disableSignUp: env.BETTER_AUTH_DISABLE_SIGNUP === "1",
  // ...
}
```

This keeps one env var as the single kill-switch across both providers, matching existing repo
convention. Note it gates _signup only_ — existing users can still sign in, and **password reset
stays open** (reset is not signup-gated), which is the desired behaviour for a closed beta.

---

## 6. Rate limiting

### Out of the box (`api/rate-limiter/index.mjs`)

Defaults, from `context/create-context.mjs:162-167`:

```js
enabled: options.rateLimit?.enabled ?? isProduction,
window:  options.rateLimit?.window  || 10,
max:     options.rateLimit?.max     || 100,
storage: options.rateLimit?.storage || (options.secondaryStorage ? "secondary-storage" : "memory"),
```

Built-in special rules (`getDefaultSpecialRules()`, :185-198) — better than the docs page suggests,
which lists only `/sign-in/email`:

- `/sign-in*`, `/sign-up*`, `/change-password*`, `/change-email*` → **3 per 10s**
- `/request-password-reset`, `/send-verification-email`, `/forget-password*`, `/email-otp/*` → **3
  per 60s**

Server-side `auth.api` calls bypass rate limiting entirely.

### The gap on Workers — **this is a real finding, and it is pre-existing**

`grep -rn "trustedOrigins|secondaryStorage|rateLimit" src/` returns **nothing**. So today the repo
runs with `storage: "memory"`, enabled in production. On Workers, memory is **per-isolate and
ephemeral** — Cloudflare spins up many isolates across colos and evicts them freely, so the counter
is near-useless as a brute-force control. The docs concede memory storage "may not be suitable for
many use cases, particularly in serverless environments"
([rate-limit](https://www.better-auth.com/docs/concepts/rate-limit)).

Google-only login masked this (OAuth brute-force isn't a thing). **Opening a public password login
makes it load-bearing.** Fix before shipping.

**Recommendation: KV via `secondaryStorage`.** The rate-limit storage wrapper passes a TTL straight
through to `secondaryStorage.set(key, value, ttl)` (:76, :91) — KV's native TTL, so entries
self-expire with no cleanup job.

```ts
secondaryStorage: {
  get: async (key) => await env.KV.get(key),
  set: async (key, value, ttl) =>
    await env.KV.put(key, value, ttl ? { expirationTtl: ttl } : undefined),
  delete: async (key) => await env.KV.delete(key),
},
rateLimit: { enabled: true, storage: "secondary-storage" },
```

**D1 vs KV:** prefer **KV**. `storage: "database"` needs a new `rateLimit` table (one more Drizzle
migration — it does not exist in `auth-schema.ts`) and turns every auth request into extra D1
read+write on the critical path. KV is the already-bound, TTL-native fit, and the repo already uses
KV for caching per CLAUDE.md.

**KV caveat to be honest about:** KV is eventually consistent with edge caching, so counts can
undercount across colos — it is a speed bump, not a hard limiter. For a genuinely strong limit you'd
need a Durable Object (`customStorage`) — worth noting as a follow-up, almost certainly overkill
now.

**Also consider** tightening `/sign-in/email` beyond 3-per-10s (that allows 18/min sustained) and
adding Turnstile on the login/signup forms if abuse appears.

---

## Decisions needed from a human

1. **`requireEmailVerification: true`?** Recommended — but it makes duplicate signups return a
   fake-success synthetic user, which the signup UI must be written against (§3).
2. **Rate-limit storage: KV `secondaryStorage` (recommended) vs D1 `"database"` (extra migration)?**
   Note enabling `secondaryStorage` also moves better-auth _session_ storage to KV — a broader
   change than rate limiting alone. Confirm that's acceptable.
3. **Accept that "forgot password" lets a Google-only user set a password** (§3)? If not, we need to
   gate `sendResetPassword` on the user having a `credential` account. Related:
   `revokeSessionsOnPasswordReset: true`?
4. **Build a `/verify-email` landing page, or just redirect to `/dashboard`?** Only affects
   error-message quality (§4).
5. **Two new emails needed** (`src/emails/`): `ResetPasswordEmail.tsx`, `VerifyEmailEmail.tsx` —
   `@react-email/components@1.0.12` + Resend already wired; follow `InviteEmail.tsx` and reuse
   `EMAIL_CONFIG.from`.

## Could not verify

- Whether workerd's `node:crypto.scrypt` runs off-thread (like Node's libuv pool) or blocks the
  isolate. Cloudflare does not document this. It is native code either way, so the CPU cost is
  orders of magnitude below the pure-JS path that caused #8860 — but I did not benchmark it on a
  real Worker.
- No first-party benchmark of `N=16384, r=16` native scrypt latency on Workers. **A single deployed
  timing test on `/sign-up/email` would close both of these** and is the cheapest way to de-risk §1a
  before committing.
- Exact `@better-auth/utils` version that introduced the `workerd` condition — 0.4.1 (installed) has
  it; the boundary version is not stated in the issue thread.
