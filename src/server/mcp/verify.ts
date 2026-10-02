import { createLocalJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { JSONWebKeySet, JWTPayload } from "jose";
import {
	bearerChallenge,
	bearerToken,
	issuerUrl,
	parseScopes,
	type ChallengeError,
} from "@/domain/mcpEndpoint";
import { MCP_SCOPE, ORG_CLAIM, mcpResourceUrl } from "@/domain/mcpOauth";
import type { Actor } from "@/domain/permission";
import type { ConnectionKey } from "./actor";

export const JWKS_TTL_MS = 10 * 60 * 1000;
/** Floor between reloads triggered by unknown `kid`s, so junk tokens can't hammer D1. */
export const JWKS_UNKNOWN_KID_COOLDOWN_MS = 10 * 1000;

export type VerifiedMcpRequest = {
	token: string;
	actor: Actor;
	clientId: string;
	scopes: string[];
	expiresAt?: number;
};

export type VerifyDeps = {
	/** Our origin (`BETTER_AUTH_URL`); drives `iss`, `aud` and the challenge. */
	ownOrigin: string;
	loadKeys: () => Promise<JSONWebKeySet>;
	loadActor: (key: ConnectionKey) => Promise<Actor | null>;
	now?: () => number;
};

/** Per-isolate memo of the `jwks` table, refreshed on TTL expiry or an unknown `kid`. */
export function createJwksResolver(
	loadKeys: () => Promise<JSONWebKeySet>,
	now: () => number = Date.now
) {
	let keys: JSONWebKeySet | null = null;
	let loadedAt = 0;
	let inflight: Promise<void> | null = null;

	const reload = () => {
		inflight ??= loadKeys()
			.then((loaded) => {
				keys = loaded;
				loadedAt = now();
			})
			.finally(() => {
				inflight = null;
			});
		return inflight;
	};

	const has = (kid: string | undefined) => !!kid && !!keys?.keys.some((k) => k.kid === kid);

	return async (kid: string | undefined): Promise<ReturnType<typeof createLocalJWKSet>> => {
		if (!keys || now() - loadedAt > JWKS_TTL_MS) await reload();
		else if (!has(kid) && now() - loadedAt > JWKS_UNKNOWN_KID_COOLDOWN_MS) await reload();
		return createLocalJWKSet(keys ?? { keys: [] });
	};
}

const challenge = (origin: string, status: 401 | 403, error?: ChallengeError) =>
	new Response(null, {
		status,
		headers: { "WWW-Authenticate": bearerChallenge(origin, error) },
	});

const unauthorized = (origin: string, error?: ChallengeError) => challenge(origin, 401, error);
const insufficientScope = (origin: string) => challenge(origin, 403, "insufficient_scope");

/**
 * Bearer-token gate for `/api/mcp`: JWT (sig, `iss`, `aud`, `exp`) → scope → live Connection
 * (member ⋈ consent). Returns the Actor, or the 401/403 `Response` to send.
 */
export function createMcpVerifier(deps: VerifyDeps) {
	const { ownOrigin, loadActor } = deps;
	const resolveKeys = createJwksResolver(deps.loadKeys, deps.now);
	const issuer = issuerUrl(ownOrigin);
	const audience = mcpResourceUrl(ownOrigin);

	return async function verifyMcpRequest(request: Request): Promise<VerifiedMcpRequest | Response> {
		const token = bearerToken(request.headers.get("authorization"));
		if (!token) return unauthorized(ownOrigin);

		// Outside the try: a D1 failure loading keys is ours (5xx), not a bad token.
		const keySet = await resolveKeys(peekKid(token));
		let payload: JWTPayload;
		try {
			({ payload } = await jwtVerify(token, keySet, {
				issuer,
				audience,
				algorithms: ["EdDSA", "ES256", "RS256"],
				requiredClaims: ["exp"],
			}));
		} catch {
			return unauthorized(ownOrigin, "invalid_token");
		}

		const userId = payload.sub;
		const clientId = payload.azp;
		const orgId = payload[ORG_CLAIM];
		if (
			typeof userId !== "string" ||
			typeof clientId !== "string" ||
			typeof orgId !== "string" ||
			!userId ||
			!clientId ||
			!orgId
		) {
			return unauthorized(ownOrigin, "invalid_token");
		}

		const scopes = parseScopes(payload.scope);
		if (!scopes.includes(MCP_SCOPE)) return insufficientScope(ownOrigin);

		const actor = await loadActor({ userId, clientId, orgId });
		if (!actor) return unauthorized(ownOrigin, "invalid_token");

		return { token, actor, clientId, scopes, expiresAt: payload.exp };
	};
}

export type McpVerifier = ReturnType<typeof createMcpVerifier>;

function peekKid(token: string): string | undefined {
	try {
		return decodeProtectedHeader(token).kid;
	} catch {
		return undefined;
	}
}
