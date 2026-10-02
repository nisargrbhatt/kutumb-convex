import { createFileRoute } from "@tanstack/react-router";
import { metadataPreflightResponse, protectedResourceMetadataResponse } from "@/lib/oauth-metadata";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/api/mcp")({
	server: {
		handlers: {
			GET: () => protectedResourceMetadataResponse(),
			OPTIONS: () => metadataPreflightResponse(),
		},
	},
});
