import { createFileRoute } from "@tanstack/react-router";
import { metadataPreflightResponse, protectedResourceMetadataResponse } from "@/lib/oauth-metadata";

// Root alias: v1 has one protected resource, so clients probing the bare path get the same doc.
export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
	server: {
		handlers: {
			GET: () => protectedResourceMetadataResponse(),
			OPTIONS: () => metadataPreflightResponse(),
		},
	},
});
