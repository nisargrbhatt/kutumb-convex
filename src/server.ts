import handler from "@tanstack/react-start/server-entry";

const BLOB_PREFIX = "/api/blob/";

/**
 * Worker entry. Blob routes run here, ahead of TanStack (spec: Serving). `scheduled` hosts the
 * hourly sweep (spec: Blobs > Sweep).
 */
export default {
	async fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname.startsWith(BLOB_PREFIX)) {
			return new Response("Not found", {
				status: 404,
				headers: { "Cache-Control": "no-store" },
			});
		}
		return handler.fetch(request);
	},
	async scheduled() {},
} satisfies ExportedHandler<Env>;
