# Auth known limitations — accepted tradeoffs, not bugs

Three behaviors in the auth surface are deliberate. Listed here so a future maintainer filing them
as bugs finds the reasoning first.

- **Email enumeration is accepted on signup.** Signup errors reveal whether an email is already
  registered. Generic ("if this exists…") copy is used only on password reset, where the leak is
  more sensitive. Signup-side enumeration was judged low-value to an attacker and not worth the UX
  cost of vague signup errors.

- **`BETTER_AUTH_DISABLE_SIGNUP` breaks invites for users without accounts.** Disabling signup
  correctly blocks self-serve registration, but an invited user with no existing account has no path
  to accept — invite acceptance goes through the same signup gate. Accepted: the two flags were
  never designed to compose, and the fix (a signup path scoped to invitations) is out of scope here.

- **An unverified password user clicking "Continue with Google" hits a hard `"account not linked"`
  error until they verify.** better-auth requires a verified email before it will link a Google
  identity to an existing password account. Accepted: surfacing this as a hard error (rather than
  silently creating a second account) is the safer failure mode.

_Amended 2026-09-17: the Stripe org-deletion bullet was removed with the billing rip
(`.scratch/free-tier`). Remaining bullets unchanged._ _Amended 2026-10-02: the KV rate-limit bullet
was removed — limiter moved to D1 with atomic `consume()` (better-auth 1.7 upgrade,
`.scratch/mcp`)._
