import handler from "@tanstack/react-start/server-entry";
import { BLOB_PATH_PREFIX } from "@/domain/blob";
import { blobRoute } from "@/server/blobRoute";
import { billingSweep } from "@/server/billingSweep";
import { blobSweep } from "@/server/blobSweep";

const SIGN_OUT_PATH = "/api/auth/sign-out";

/**
 * Worker entry. Blob routes run here, ahead of TanStack (spec: Serving). `scheduled` hosts the
 * hourly sweeps (spec: Blobs > Sweep; billing > Reminders).
 */
export default {
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname.startsWith(BLOB_PATH_PREFIX)) return blobRoute.fetch(request);
		const response = await handler.fetch(request);
		// Browser cache isn't per user: drop cached private blobs on sign-out (best effort).
		if (pathname === SIGN_OUT_PATH && request.method === "POST" && response.ok) {
			const cleared = new Response(response.body, response);
			cleared.headers.set("Clear-Site-Data", '"cache"');
			return cleared;
		}
		return response;
	},
	async scheduled() {
		// Independent; both never throw.
		const [blob, billing] = await Promise.all([blobSweep.run(), billingSweep.run()]);
		console.info("blob sweep", blob);
		console.info("billing sweep", billing);
	},
} satisfies ExportedHandler<Env>;
