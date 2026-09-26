# 10 — authRoutes module + AuthCardShell + auth-hooks / email split

Status: done Depends: 01 Review candidates: 7, 8, 17 · ADR-0002 unchanged

## Spec

### `src/domain/authRoutes.ts`

```ts
export const DEFAULT_POST_AUTH = "/dashboard";
export const loginHref = (o?: { redirectTo?: string; invitation?: string }) => string; // "/login?redirectTo=…&invitation=…"
export const postAuthDestination = (search: { redirectTo?: string }) => string; // rejects external / non-"/" paths
export const isOnboardingPath = (pathname: string) => boolean;
```

Used by `_authed.tsx`, `authMiddleware`, `login.tsx`, `signup.tsx`, invite email link in
`auth-hooks.ts`. Middleware redirect now carries `redirectTo`.

### `src/components/auth/AuthCardShell.tsx`

`<AuthCardShell title description footer>{children}</AuthCardShell>` = `RootLayout` › centered
`Card max-w-sm`. Google button + divider remain per-page children. Used by login, signup,
forgot-password, reset-password.

### `src/lib/auth-hooks.ts`

`organizationHooks` (limits via issue 02) + `databaseHooks` (first-org session seed) moved out of
`auth.ts`. `auth.ts` = `betterAuth({...})` wiring only.

### `src/lib/email.ts` + `src/emails/EmailLayout.tsx`

```ts
export async function sendEmail(o: {
	to: string;
	subject: string;
	react: ReactElement;
}): Promise<void>; // Resend adapter, from EMAIL_CONFIG.from, logs on error, never throws
```

`EmailLayout` — `Tailwind` config with tokens taken from the app palette (`src/styles.css`
`--primary` etc. as hex), logo/wordmark header, `Preview`, `Container`, footer with org/app name.
Invite / Verify / ResetPassword shrink to body copy inside `<EmailLayout preview>`.

## Acceptance

- `grep -rn '"/login"' src --include=*.tsx --include=*.ts` only inside `authRoutes.ts` + routes' own
  `createFileRoute("/login")`.
- `grep -rn "resend.emails.send" src` = 1 (in `email.ts`).
- `wc -l src/lib/auth.ts` < 80.
- `npx react-email preview` (or `npm run email:dev` if present) renders all three with same
  header/footer.
- Tests: `authRoutes.test.ts` — href encoding, `postAuthDestination` rejects `//evil`, `http://…`,
  keeps `/members?x=1`; `isOnboardingPath` cases.

## Comments

Implemented. `domain/authRoutes.ts` (pure): path consts (`LOGIN_PATH`, `SIGNUP_PATH`,
`ONBOARDING_*`, `DEFAULT_POST_AUTH`), `authSearchSchema` (moved from `lib/auth-search-params.ts`,
deleted), `authHref`/`loginHref`, `postAuthDestination` (WHATWG URL origin check → rejects `//x`,
`/\x`, `/\t/x`, `http:`, `javascript:`; keeps search + hash), `isOnboardingPath` (no longer matches
`/onboardingx`). 24 tests.

Consumers: `_authed` (redirectTo = `location.href`, keeps search), `_community`, login/signup
(destination via `postAuthDestination` — was raw `redirectTo` = open redirect), forgot/reset, logout
in Header + AuthUser, invite link in `auth-hooks`.

Deviations:
- `authMiddleware`: server-fn calls from client hit `/_serverFn/…`, so redirectTo was garbage → now
  uses same-origin Referer page for those, request path for SSR.
- `AuthCardShell` footer wraps in `FieldDescription`; signup-disabled branch + reset invalid-link
  card use it too.
- `lib/resend.ts` folded into `lib/email.ts`. `EMAIL_CONFIG` gained `appName`/`appUrl` (absolute
  logo URL — prod custom domain from wrangler.jsonc).
- `auth-hooks.ts` also holds the 3 email senders (not just org/db hooks) so `auth.ts` = wiring
  (69 lines). `limitGuard` dedupes LimitError → APIError.
- `EmailLayout` exports `EMAIL_TOKENS` + `emailButtonClass`; templates import it relatively.

Verified: all 3 emails rendered via `render()` — shared logo header/footer, palette applied (rgb).
Browser: /login, /signup, /reset-password on shell; signup link carries `redirectTo`. tsc
(pre-existing `CommunityNav` only), lint, format, 157 tests. Acceptance greps pass.
