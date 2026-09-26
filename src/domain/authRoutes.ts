import z from "zod";

export const LOGIN_PATH = "/login";
export const SIGNUP_PATH = "/signup";
export const ONBOARDING_CREATE_PATH = "/onboarding/create";
export const ONBOARDING_INVITATIONS_PATH = "/onboarding/invitations";
export const DEFAULT_POST_AUTH = "/dashboard";

/**
 * Shared across `/login` and `/signup` so `redirectTo` and `invitation` survive the
 * footer hop between the two pages, and `error` carries an OAuth callback failure back.
 */
export const authSearchSchema = z.object({
	redirectTo: z.string().trim().optional(),
	invitation: z.string().trim().optional(),
	error: z.string().trim().optional(),
});

export type AuthSearch = z.infer<typeof authSearchSchema>;

type AuthCarry = { redirectTo?: string; invitation?: string };

/** `/login` or `/signup` href carrying `redirectTo` / `invitation` (omitted when empty). */
export function authHref(pathname: typeof LOGIN_PATH | typeof SIGNUP_PATH, o: AuthCarry = {}) {
	const params = new URLSearchParams();
	if (o.redirectTo) params.set("redirectTo", o.redirectTo);
	if (o.invitation) params.set("invitation", o.invitation);
	const qs = params.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

export const loginHref = (o?: AuthCarry) => authHref(LOGIN_PATH, o);

const ORIGIN = "https://same-origin.invalid";

/**
 * Where to land after sign-in/up. Only same-origin absolute paths pass — `//evil`,
 * `/\evil`, `http://…`, `javascript:` all fall back to `DEFAULT_POST_AUTH`. Parsed with
 * WHATWG URL (same rules as the browser) so tab/newline/backslash tricks are normalised
 * before the origin check.
 */
export function postAuthDestination(search: { redirectTo?: string }): string {
	const raw = search.redirectTo;
	if (!raw || !raw.startsWith("/")) return DEFAULT_POST_AUTH;
	let url: URL;
	try {
		url = new URL(raw, ORIGIN);
	} catch {
		return DEFAULT_POST_AUTH;
	}
	if (url.origin !== ORIGIN) return DEFAULT_POST_AUTH;
	return `${url.pathname}${url.search}${url.hash}`;
}

export const isOnboardingPath = (pathname: string) =>
	pathname === "/onboarding" || pathname.startsWith("/onboarding/");
