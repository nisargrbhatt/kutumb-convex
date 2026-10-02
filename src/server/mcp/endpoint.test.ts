import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/domain/permission";
import { createMcpEndpoint } from "./endpoint";
import type { VerifiedMcpRequest } from "./verify";

const OWN = "https://kutumb.example.org";
const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const VERIFIED: VerifiedMcpRequest = {
	token: "tok",
	actor: ACTOR,
	clientId: "c1",
	scopes: ["community:read"],
	expiresAt: 123,
};

function setup(over: { verify?: unknown; success?: boolean } = {}) {
	const verify = vi.fn(async () => (over.verify ?? VERIFIED) as VerifiedMcpRequest | Response);
	const limit = vi.fn(async () => ({ success: over.success ?? true }));
	const fetch = vi.fn(async () => new Response("mcp"));
	const handle = createMcpEndpoint({
		ownOrigin: OWN,
		verify,
		limiter: { limit },
		handler: { fetch },
	});
	return { handle, verify, limit, fetch };
}

const req = (headers: Record<string, string> = {}) =>
	new Request(`${OWN}/api/mcp`, {
		method: "POST",
		headers: { host: "kutumb.example.org", ...headers },
	});

describe("createMcpEndpoint", () => {
	it("foreign Origin → 403 before auth", async () => {
		const { handle, verify } = setup();
		const res = await handle(req({ origin: "https://evil.test" }));
		expect(res.status).toBe(403);
		expect(verify).not.toHaveBeenCalled();
	});

	it("wrong Host → 403 before auth", async () => {
		const { handle, verify } = setup();
		const res = await handle(req({ host: "evil.test" }));
		expect(res.status).toBe(403);
		expect(verify).not.toHaveBeenCalled();
	});

	it("missing Origin is allowed", async () => {
		const { handle, fetch } = setup();
		expect((await handle(req())).status).toBe(200);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("passes verify's 401 through, no rate-limit spend", async () => {
		const denied = new Response(null, { status: 401 });
		const { handle, limit, fetch } = setup({ verify: denied });
		expect(await handle(req())).toBe(denied);
		expect(limit).not.toHaveBeenCalled();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("rate-limits per clientId:userId → 429 + Retry-After", async () => {
		const { handle, limit, fetch } = setup({ success: false });
		const res = await handle(req());
		expect(limit).toHaveBeenCalledWith({ key: "c1:u1" });
		expect(res.status).toBe(429);
		expect(res.headers.get("retry-after")).toBe("60");
		expect(fetch).not.toHaveBeenCalled();
	});

	it("hands the verified Actor to the MCP handler via authInfo.extra", async () => {
		const { handle, fetch } = setup();
		await handle(req());
		const [, options] = fetch.mock.calls[0] as unknown as [Request, { authInfo: unknown }];
		expect(options.authInfo).toMatchObject({
			token: "tok",
			clientId: "c1",
			scopes: ["community:read"],
			expiresAt: 123,
			extra: { actor: ACTOR },
		});
	});

	it("sets no CORS headers", async () => {
		const { handle } = setup({ verify: new Response(null, { status: 401 }) });
		expect((await handle(req())).headers.get("access-control-allow-origin")).toBeNull();
	});
});
