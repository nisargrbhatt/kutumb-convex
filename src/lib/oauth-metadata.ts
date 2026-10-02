import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { env } from "cloudflare:workers";
import { MCP_SCOPE, mcpResourceUrl } from "@/domain/mcpOauth";
import { auth } from "./auth";

/** Discovery documents are public + credential-less, so any origin (incl. browser clients) may read. */
const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" } as const;

/** RFC 8414 AS metadata (also served at the OIDC discovery path). Issuer = `${origin}/api/auth`. */
export const authorizationServerMetadataResponse = oauthProviderAuthServerMetadata(auth, {
	headers: CORS_HEADERS,
});

/** RFC 9728 PRM for the MCP endpoint; `resource` = `${origin}/api/mcp`. */
export async function protectedResourceMetadataResponse(): Promise<Response> {
	const { baseURL } = await auth.$context;
	const metadata = await oauthProviderResourceClient(auth)
		.getActions()
		.getProtectedResourceMetadata({
			resource: mcpResourceUrl(env.BETTER_AUTH_URL),
			// `baseURL` carries the `/api/auth` base path; the client helper would use the bare origin.
			authorization_servers: [baseURL],
			scopes_supported: [MCP_SCOPE],
			bearer_methods_supported: ["header"],
		});
	return Response.json(metadata, {
		headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=15, stale-while-revalidate=15" },
	});
}

export const metadataPreflightResponse = () =>
	new Response(null, {
		status: 204,
		headers: {
			...CORS_HEADERS,
			"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
			"Access-Control-Max-Age": "86400",
		},
	});
