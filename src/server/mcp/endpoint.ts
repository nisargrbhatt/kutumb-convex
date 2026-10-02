import type { AuthInfo } from "@modelcontextprotocol/server";
import { checkOriginAndHost } from "@/domain/mcpEndpoint";
import { mcpResourceUrl } from "@/domain/mcpOauth";
import type { McpVerifier } from "./verify";

/** Matches the `ratelimits` period in wrangler.jsonc. */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

export type EndpointDeps = {
	ownOrigin: string;
	verify: McpVerifier;
	/** Cloudflare Workers Rate Limiting binding. */
	limiter: Pick<RateLimit, "limit">;
	handler: {
		fetch: (request: Request, options?: { authInfo?: AuthInfo }) => Promise<Response>;
	};
};

const forbidden = (message: string) => Response.json({ error: message }, { status: 403 });

/**
 * `/api/mcp`: Origin/Host guard → bearer verify → per-`clientId:userId` rate limit → MCP handler.
 * No CORS headers: browser-based clients are unsupported in v1.
 */
export function createMcpEndpoint(deps: EndpointDeps) {
	return async function handleMcpRequest(request: Request): Promise<Response> {
		const origin = checkOriginAndHost(
			{ origin: request.headers.get("origin"), host: request.headers.get("host") },
			deps.ownOrigin
		);
		if (origin === "bad_origin") return forbidden("Origin not allowed");
		if (origin === "bad_host") return forbidden("Host not allowed");

		const verified = await deps.verify(request);
		if (verified instanceof Response) return verified;

		const { success } = await deps.limiter.limit({
			key: `${verified.clientId}:${verified.actor.userId}`,
		});
		if (!success) {
			return Response.json(
				{ error: "Rate limit exceeded" },
				{ status: 429, headers: { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) } }
			);
		}

		return deps.handler.fetch(request, {
			authInfo: {
				token: verified.token,
				clientId: verified.clientId,
				scopes: verified.scopes,
				expiresAt: verified.expiresAt,
				resource: new URL(mcpResourceUrl(deps.ownOrigin)),
				extra: { actor: verified.actor },
			},
		});
	};
}
