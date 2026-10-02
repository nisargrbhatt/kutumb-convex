import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { mcpResourceUrl } from "@/domain/mcpOauth";

/** Public: the MCP URL for this deployment, derived from `BETTER_AUTH_URL` (tunnel-friendly). */
export const getMcpUrl = createServerFn({ method: "GET" }).handler(() =>
	mcpResourceUrl(env.BETTER_AUTH_URL)
);
