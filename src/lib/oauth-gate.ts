import { redirect } from "@tanstack/react-router";
import { LOGIN_PATH } from "@/domain/authRoutes";

/**
 * `beforeLoad` shared by `/oauth/*` screens. They sit outside `_authed`, so each gates itself: an
 * expired session returns here after /login. Yields the requesting `client_id` and the `scope`
 * the client asked for (space-separated; part of the signed authorization query).
 */
export function oauthBeforeLoad({
	context,
	location,
}: {
	context: { session?: unknown };
	location: { href: string; searchStr: string };
}) {
	if (!context.session) {
		throw redirect({ to: LOGIN_PATH, search: { redirectTo: location.href } });
	}
	const params = new URLSearchParams(location.searchStr);
	return { clientId: params.get("client_id"), requestedScope: params.get("scope") };
}
