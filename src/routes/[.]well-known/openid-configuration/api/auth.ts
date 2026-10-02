import { createFileRoute } from "@tanstack/react-router";
import {
	authorizationServerMetadataResponse,
	metadataPreflightResponse,
} from "@/lib/oauth-metadata";

export const Route = createFileRoute("/.well-known/openid-configuration/api/auth")({
	server: {
		handlers: {
			GET: ({ request }) => authorizationServerMetadataResponse(request),
			OPTIONS: () => metadataPreflightResponse(),
		},
	},
});
