import { env } from "cloudflare:workers";
import type { JSONWebKeySet } from "jose";
import { db } from "@/db";
import { jwks } from "@/db/schema";
import { createMcpEndpoint } from "./endpoint";
import { loadConnectionActor } from "./actor";
import { createKutumbMcpHandler } from "./server";
import { createMcpVerifier } from "./verify";

/** `jwks` rows → JWKS. Row id is the `kid`; `alg` is null for the plugin default (EdDSA). */
async function loadJwks(): Promise<JSONWebKeySet> {
	const rows = await db.select().from(jwks);
	return {
		keys: rows.map((row) => ({
			...JSON.parse(row.publicKey),
			kid: row.id,
			alg: row.alg ?? "EdDSA",
			use: "sig",
		})),
	};
}

export const handleMcpRequest = createMcpEndpoint({
	ownOrigin: env.BETTER_AUTH_URL,
	verify: createMcpVerifier({
		ownOrigin: env.BETTER_AUTH_URL,
		loadKeys: loadJwks,
		loadActor: (key) => loadConnectionActor(db, key),
	}),
	limiter: env.MCP_RATE_LIMITER,
	handler: createKutumbMcpHandler(),
});
