/** Pure helpers for the MCP resource server (`/api/mcp`): bearer parsing, challenges, Origin/Host. */
import { MCP_SCOPE } from "./mcpOauth";
import type { Role } from "./permission";

export const PRM_PATH = "/.well-known/oauth-protected-resource/api/mcp";
/** better-auth's issuer = base URL incl. its `/api/auth` base path. */
export const ISSUER_PATH = "/api/auth";

const trimOrigin = (origin: string) => origin.replace(/\/+$/, "");

export const protectedResourceMetadataUrl = (origin: string) => `${trimOrigin(origin)}${PRM_PATH}`;
export const issuerUrl = (origin: string) => `${trimOrigin(origin)}${ISSUER_PATH}`;

/** `Authorization: Bearer <token>` → token (scheme is case-insensitive per RFC 7235). */
export function bearerToken(header: string | null | undefined): string | null {
	if (!header) return null;
	const match = /^Bearer +([^\s]+)$/i.exec(header.trim());
	return match ? match[1] : null;
}

export const parseScopes = (scope: unknown): string[] =>
	typeof scope === "string" ? scope.split(/\s+/).filter(Boolean) : [];

export type ChallengeError = "invalid_token" | "insufficient_scope";

/** RFC 9728 / RFC 6750 `WWW-Authenticate`. No `error` when the request carried no credentials. */
export function bearerChallenge(origin: string, error?: ChallengeError): string {
	const params = [
		...(error ? [`error="${error}"`] : []),
		`resource_metadata="${protectedResourceMetadataUrl(origin)}"`,
		`scope="${MCP_SCOPE}"`,
	];
	return `Bearer ${params.join(", ")}`;
}

export type RequestOriginCheck = "ok" | "bad_origin" | "bad_host";

/**
 * DNS-rebinding / cross-origin guard. A present `Origin` must be ours; a missing one is allowed
 * (non-browser clients send none). `Host` must be our own host.
 */
export function checkOriginAndHost(
	headers: { origin: string | null; host: string | null },
	ownOrigin: string
): RequestOriginCheck {
	const own = URL.parse(ownOrigin);
	if (!own) return "bad_host";
	if (headers.origin !== null && headers.origin !== own.origin) return "bad_origin";
	if (headers.host?.toLowerCase() !== own.host.toLowerCase()) return "bad_host";
	return "ok";
}

const ROLES: readonly Role[] = ["owner", "admin", "member"];

/** better-auth stores multiple roles comma-separated; take the most privileged known one. */
export function parseRole(raw: string): Role | null {
	const held = new Set(raw.split(",").map((r) => r.trim()));
	return ROLES.find((r) => held.has(r)) ?? null;
}
