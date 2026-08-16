import z from "zod";

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

/**
 * `errorCallbackURL` for the Google button on `/login` and `/signup` — carries
 * `redirectTo`/`invitation` through the OAuth round trip so a failure lands back on
 * the same page with those params intact, plus the `error` better-auth appends.
 */
export function buildAuthCallbackPath(
	pathname: "/login" | "/signup",
	search: { redirectTo?: string; invitation?: string }
) {
	const params = new URLSearchParams();
	if (search.redirectTo) params.set("redirectTo", search.redirectTo);
	if (search.invitation) params.set("invitation", search.invitation);
	const qs = params.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}
