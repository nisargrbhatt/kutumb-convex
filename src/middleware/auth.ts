import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { auth } from "@/lib/auth";
import { LOGIN_PATH, postAuthDestination } from "@/domain/authRoutes";

/**
 * Page the user was on. For a client-side server-fn call the request URL is the
 * `/_serverFn/…` endpoint, so fall back to the (same-origin) Referer page instead.
 */
function currentPagePath(headers: Headers): string | undefined {
	const url = getRequestUrl();
	if (!url.pathname.startsWith("/_serverFn")) return `${url.pathname}${url.search}`;
	const referer = headers.get("referer");
	if (!referer) return undefined;
	const ref = URL.parse(referer);
	return ref && ref.origin === url.origin ? `${ref.pathname}${ref.search}` : undefined;
}

export const authMiddleware = createMiddleware().server(async ({ next }) => {
	const headers = getRequestHeaders();
	const session = await auth.api.getSession({ headers });

	if (!session) {
		const from = currentPagePath(headers);
		throw redirect({
			to: LOGIN_PATH,
			search: from ? { redirectTo: postAuthDestination({ redirectTo: from }) } : {},
		});
	}

	return await next({
		context: {
			session: session,
			userId: session?.user?.id,
		},
	});
});
