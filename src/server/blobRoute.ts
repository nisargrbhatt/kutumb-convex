import { env } from "cloudflare:workers";
import { getSessionCookie } from "better-auth/cookies";
import { db } from "@/db";
import { makeBlobRoute } from "@/domain/blobRoute";
import { auth } from "@/lib/auth";

/** `/api/blob/*` handler wired to D1, the `BLOBS` bucket and the live better-auth session. */
export const blobRoute = makeBlobRoute({
	db,
	bucket: env.BLOBS,
	getUserId: async (request) =>
		(await auth.api.getSession({ headers: request.headers }))?.user.id ?? null,
	sessionToken: (request) => getSessionCookie(request),
	now: () => new Date(),
});
