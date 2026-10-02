import { SignJWT, exportJWK, generateKeyPair } from "jose";
import type { JSONWebKeySet } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/domain/permission";
import {
	JWKS_TTL_MS,
	JWKS_UNKNOWN_KID_COOLDOWN_MS,
	createJwksResolver,
	createMcpVerifier,
	type VerifiedMcpRequest,
} from "./verify";

const OWN = "https://kutumb.example.org";
const ISS = `${OWN}/api/auth`;
const AUD = `${OWN}/api/mcp`;
const PRM = `${OWN}/.well-known/oauth-protected-resource/api/mcp`;
const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "admin" };

type Pair = Awaited<ReturnType<typeof generateKeyPair>>;
let keyA: { kid: string; pair: Pair };
let keyB: { kid: string; pair: Pair };
let jwksA: JSONWebKeySet;

async function makeKey(kid: string) {
	return { kid, pair: await generateKeyPair("EdDSA", { extractable: true }) };
}
const publicJwk = async (k: { kid: string; pair: Pair }) => ({
	...(await exportJWK(k.pair.publicKey)),
	kid: k.kid,
	alg: "EdDSA",
});

beforeAll(async () => {
	keyA = await makeKey("key-a");
	keyB = await makeKey("key-b");
	jwksA = { keys: [await publicJwk(keyA)] };
});

type Claims = Partial<{
	iss: string;
	aud: string;
	sub: string | null;
	azp: string | null;
	org_id: string | null;
	scope: string | null;
	exp: number | string;
	kid: string;
	key: { kid: string; pair: Pair };
}>;

async function token(over: Claims = {}) {
	const key = over.key ?? keyA;
	const claims: Record<string, unknown> = {
		azp: "client-1",
		org_id: "o1",
		scope: "community:read offline_access",
	};
	for (const k of ["azp", "org_id", "scope"] as const) {
		if (k in over) claims[k] = over[k];
		if (claims[k] === null) delete claims[k];
	}
	const jwt = new SignJWT(claims)
		.setProtectedHeader({ alg: "EdDSA", kid: over.kid ?? key.kid })
		.setIssuer(over.iss ?? ISS)
		.setAudience(over.aud ?? AUD)
		.setIssuedAt();
	if (over.sub !== null) jwt.setSubject(over.sub ?? "u1");
	jwt.setExpirationTime(over.exp ?? "1h");
	return jwt.sign(key.pair.privateKey);
}

const req = (authorization?: string) =>
	new Request(AUD, { method: "POST", headers: authorization ? { authorization } : {} });

function setup(opts: { actor?: Actor | null; keys?: JSONWebKeySet } = {}) {
	const loadActor = vi.fn(async () => (opts.actor === undefined ? ACTOR : opts.actor));
	const loadKeys = vi.fn(async () => opts.keys ?? jwksA);
	const verify = createMcpVerifier({ ownOrigin: OWN, loadKeys, loadActor });
	return { verify, loadActor, loadKeys };
}

const challenge = (error?: string) =>
	`Bearer ${error ? `error="${error}", ` : ""}resource_metadata="${PRM}", scope="community:read"`;

async function expectResponse(result: VerifiedMcpRequest | Response, status: number, www: string) {
	expect(result).toBeInstanceOf(Response);
	const res = result as Response;
	expect(res.status).toBe(status);
	expect(res.headers.get("www-authenticate")).toBe(www);
}

describe("verifyMcpRequest", () => {
	it("returns the Actor, client and scopes for a valid token", async () => {
		const { verify, loadActor } = setup();
		const jwt = await token();
		const result = await verify(req(`Bearer ${jwt}`));
		expect(result).toMatchObject({
			token: jwt,
			actor: ACTOR,
			clientId: "client-1",
			scopes: ["community:read", "offline_access"],
		});
		expect(loadActor).toHaveBeenCalledWith({ userId: "u1", clientId: "client-1", orgId: "o1" });
	});

	it("no Authorization header → 401 challenge without error", async () => {
		const { verify } = setup();
		await expectResponse(await verify(req()), 401, challenge());
	});

	it("non-bearer / garbage token → 401 invalid_token", async () => {
		const { verify } = setup();
		await expectResponse(await verify(req("Bearer not-a-jwt")), 401, challenge("invalid_token"));
	});

	it("wrong audience → 401", async () => {
		const { verify } = setup();
		const jwt = await token({ aud: `${OWN}/other` });
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it("wrong issuer → 401", async () => {
		const { verify } = setup();
		const jwt = await token({ iss: "https://evil.test/api/auth" });
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it("expired → 401", async () => {
		const { verify } = setup();
		const jwt = await token({ exp: Math.floor(Date.now() / 1000) - 60 });
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it("token without exp → 401", async () => {
		const { verify } = setup();
		const jwt = await new SignJWT({ azp: "client-1", org_id: "o1", scope: "community:read" })
			.setProtectedHeader({ alg: "EdDSA", kid: keyA.kid })
			.setIssuer(ISS)
			.setAudience(AUD)
			.setSubject("u1")
			.sign(keyA.pair.privateKey);
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it("signed by a key not in the JWKS → 401", async () => {
		const { verify } = setup();
		const jwt = await token({ key: keyB, kid: "key-a" });
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it.each([
		["sub", { sub: null }],
		["azp", { azp: null }],
		["org_id", { org_id: null }],
	] as const)("missing %s claim → 401", async (_n, over) => {
		const { verify, loadActor } = setup();
		const jwt = await token(over);
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
		expect(loadActor).not.toHaveBeenCalled();
	});

	it("no community:read scope → 403 insufficient_scope", async () => {
		const { verify, loadActor } = setup();
		const jwt = await token({ scope: "offline_access" });
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 403, challenge("insufficient_scope"));
		expect(loadActor).not.toHaveBeenCalled();
	});

	it("no Connection / membership → 401 (client re-auths)", async () => {
		const { verify } = setup({ actor: null });
		const jwt = await token();
		await expectResponse(await verify(req(`Bearer ${jwt}`)), 401, challenge("invalid_token"));
	});

	it("reflects the current role on every call", async () => {
		const loadActor = vi
			.fn<() => Promise<Actor | null>>()
			.mockResolvedValueOnce({ ...ACTOR, role: "member" })
			.mockResolvedValueOnce({ ...ACTOR, role: "owner" })
			.mockResolvedValueOnce(null);
		const verify = createMcpVerifier({ ownOrigin: OWN, loadKeys: async () => jwksA, loadActor });
		const jwt = await token();
		const roles = [];
		for (let i = 0; i < 2; i++) {
			roles.push(((await verify(req(`Bearer ${jwt}`))) as VerifiedMcpRequest).actor.role);
		}
		expect(roles).toEqual(["member", "owner"]);
		expect((await verify(req(`Bearer ${jwt}`))) as Response).toBeInstanceOf(Response);
	});

	it("a key-load failure is a server error, not a 401", async () => {
		const verify = createMcpVerifier({
			ownOrigin: OWN,
			loadKeys: async () => {
				throw new Error("d1 down");
			},
			loadActor: async () => ACTOR,
		});
		await expect(verify(req(`Bearer ${await token()}`))).rejects.toThrow("d1 down");
	});
});

describe("createJwksResolver", () => {
	it("memoises keys until the TTL", async () => {
		let now = 1_000_000;
		const loadKeys = vi.fn(async () => jwksA);
		const resolve = createJwksResolver(loadKeys, () => now);
		await resolve("key-a");
		await resolve("key-a");
		expect(loadKeys).toHaveBeenCalledTimes(1);
		now += JWKS_TTL_MS + 1;
		await resolve("key-a");
		expect(loadKeys).toHaveBeenCalledTimes(2);
	});

	it("refetches on an unknown kid, but not within the cooldown", async () => {
		let now = 1_000_000;
		const loadKeys = vi.fn(async () => jwksA);
		const resolve = createJwksResolver(loadKeys, () => now);
		await resolve("key-a");
		await resolve("rotated-in"); // inside cooldown
		expect(loadKeys).toHaveBeenCalledTimes(1);
		now += JWKS_UNKNOWN_KID_COOLDOWN_MS + 1;
		await resolve("rotated-in");
		expect(loadKeys).toHaveBeenCalledTimes(2);
	});

	it("verifies a token signed by a freshly rotated key", async () => {
		let now = 1_000_000;
		let current = jwksA;
		const loadKeys = vi.fn(async () => current);
		const verify = createMcpVerifier({
			ownOrigin: OWN,
			loadKeys,
			loadActor: async () => ACTOR,
			now: () => now,
		});
		await verify(req(`Bearer ${await token()}`));
		current = { keys: [...jwksA.keys, await publicJwk(keyB)] };
		now += JWKS_UNKNOWN_KID_COOLDOWN_MS + 1;
		const result = await verify(req(`Bearer ${await token({ key: keyB })}`));
		expect((result as VerifiedMcpRequest).actor).toEqual(ACTOR);
	});

	it("coalesces concurrent loads", async () => {
		const loadKeys = vi.fn(async () => jwksA);
		const resolve = createJwksResolver(loadKeys);
		await Promise.all([resolve("key-a"), resolve("key-a"), resolve("key-a")]);
		expect(loadKeys).toHaveBeenCalledTimes(1);
	});
});
