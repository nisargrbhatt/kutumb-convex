/** Verbatim copy for auth error/empty states — 19-auth-pages.md. Keep both usages in sync. */
export const AUTH_COPY = {
	emailCollision:
		"An account with this email already exists. Sign in instead, or continue with Google.",
	accountNotLinked:
		"This email is already registered with a password. Sign in with your password, then verify your email to link Google.",
	signupsClosed: "Signups are closed. Kutumb isn't accepting new accounts right now.",
	resetRequested: "If that email has a password account, we've sent a reset link.",
} as const;

/** `?error=` value better-auth appends on the OAuth callback redirect for a blocked account link. */
export const OAUTH_ACCOUNT_NOT_LINKED_ERROR = "account_not_linked";

/** better-auth `error.code` values — named, not the raw HTTP status, so the checks read as intent. */
export const SIGNUP_EMAIL_COLLISION_CODE = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
export const RESET_PASSWORD_INVALID_TOKEN_CODE = "INVALID_TOKEN";
