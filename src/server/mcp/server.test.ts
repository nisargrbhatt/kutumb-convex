import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionActor } from "./actor";

const mocks = vi.hoisted(() => ({
	org: vi.fn(),
	profile: vi.fn(),
	fields: vi.fn(),
	capture: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			organization: { findFirst: mocks.org },
			communityProfile: { findFirst: mocks.profile },
			communityProfileCustomField: { findMany: mocks.fields },
		},
	},
}));
vi.mock("@/lib/posthog-server", () => ({ captureMcpToolCalled: mocks.capture }));
vi.mock("cloudflare:workers", () => ({ env: { KV: {} } }));
// No real write tools yet (slice 19+): a stand-in to observe the gate and `requireWrite`.
vi.mock("./tools/writeTools", async () => {
	const { z } = await import("zod");
	const { defineWriteTool } = await import("./tools/define");
	return {
		registerWriteTools: (server: never) =>
			defineWriteTool(
				server,
				"probe_write",
				{
					title: "Probe",
					description: "test-only",
					inputSchema: z.object({}),
					outputSchema: z.object({ outcome: z.string() }),
					destructive: false,
					idempotent: false,
				},
				async () => ({ outcome: "applied" })
			),
	};
});

const { createKutumbMcpHandler } = await import("./server");

const READ_ONLY = { canWrite: false, reason: "connection_read_only" } as const;
const ACTOR: ConnectionActor = {
	userId: "u1",
	organizationId: "o1",
	role: "admin",
	write: READ_ONLY,
};
let authInfo = {
	token: "t",
	clientId: "c1",
	scopes: ["community:read"],
	extra: { actor: ACTOR },
};
const withWrite = (write: ConnectionActor["write"]) => {
	authInfo = { ...authInfo, extra: { actor: { ...ACTOR, write } } };
};

async function rpc(method: string, params: unknown = {}) {
	const handler = createKutumbMcpHandler();
	const res = await handler.fetch(
		new Request("https://kutumb.example.org/api/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
		}),
		{ authInfo }
	);
	const text = await res.text();
	// 2025 stateless may answer as a one-event SSE stream.
	const data =
		text.startsWith("event:") || text.startsWith("data:")
			? text
					.split("\n")
					.find((l) => l.startsWith("data:"))!
					.slice(5)
			: text;
	return JSON.parse(data);
}

beforeEach(() => {
	vi.clearAllMocks();
	authInfo = { ...authInfo, extra: { actor: ACTOR } };
	mocks.org.mockResolvedValue({ id: "o1", name: "Patel Parivar" });
	mocks.profile.mockResolvedValue({ id: "p1" });
	mocks.fields.mockResolvedValue([{ id: "f1", label: "Gotra", type: "text" }]);
});

describe("MCP server (stateless, 2025 Streamable HTTP)", () => {
	it("tools/list advertises read-only tools with output schemas", async () => {
		const { result } = await rpc("tools/list");
		expect(result.tools.map((t: { name: string }) => t.name)).toEqual([
			"whoami",
			"list_custom_fields",
			"search_profiles",
			"count_profiles",
			"get_profile",
			"get_family_graph",
		]);
		for (const tool of result.tools) {
			expect(tool).toMatchObject({
				annotations: { readOnlyHint: true },
				outputSchema: { type: "object" },
			});
		}
	});

	it("whoami returns org, role and profile for the Actor", async () => {
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result.structuredContent).toEqual({
			userId: "u1",
			organization: { id: "o1", name: "Patel Parivar" },
			role: "admin",
			profileId: "p1",
			customFields: [{ id: "f1", label: "Gotra", type: "text" }],
			canWrite: false,
			reason: "connection_read_only",
			hint: expect.stringContaining("reconnect"),
		});
		expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
		expect(mocks.capture).toHaveBeenCalledWith(
			expect.objectContaining({
				tool: "whoami",
				userId: "u1",
				organizationId: "o1",
				clientId: "c1",
				isError: false,
			})
		);
	});

	it("write tools are hidden unless the Connection can effectively write", async () => {
		const read = await rpc("tools/list");
		expect(read.result.tools.map((t: { name: string }) => t.name)).not.toContain("probe_write");

		withWrite({ canWrite: false, reason: "org_writes_off" });
		const off = await rpc("tools/list");
		expect(off.result.tools.map((t: { name: string }) => t.name)).not.toContain("probe_write");

		withWrite({ canWrite: true });
		const { result } = await rpc("tools/list");
		const probe = result.tools.find((t: { name: string }) => t.name === "probe_write");
		expect(probe).toMatchObject({
			annotations: {
				readOnlyHint: false,
				openWorldHint: false,
				destructiveHint: false,
				idempotentHint: false,
			},
		});
		// Read tools stay; the write tool is added after them.
		expect(result.tools.at(-1).name).toBe("probe_write");
	});

	it("a write call runs only with effective write, and reports its outcome", async () => {
		withWrite({ canWrite: true });
		const { result } = await rpc("tools/call", { name: "probe_write", arguments: {} });
		expect(result.structuredContent).toEqual({ outcome: "applied" });
		expect(mocks.capture).toHaveBeenCalledWith(
			expect.objectContaining({ tool: "probe_write", outcome: "applied", isError: false })
		);
	});

	it("whoami: writable Connection → canWrite, no reason or hint", async () => {
		withWrite({ canWrite: true });
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result.structuredContent).toMatchObject({
			canWrite: true,
			reason: null,
			hint: null,
		});
	});

	it("whoami: owner turned writes off → org_writes_off + owner hint", async () => {
		withWrite({ canWrite: false, reason: "org_writes_off" });
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result.structuredContent).toMatchObject({
			canWrite: false,
			reason: "org_writes_off",
			hint: expect.stringContaining("owner"),
		});
	});

	it("initialize instructions tell the model to list custom fields first", async () => {
		const { result } = await rpc("initialize", {
			protocolVersion: "2025-06-18",
			capabilities: {},
			clientInfo: { name: "t", version: "1" },
		});
		expect(result.instructions).toContain("whoami or list_custom_fields");
	});

	it("profileId is null when the member has no profile", async () => {
		mocks.profile.mockResolvedValue(undefined);
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result.structuredContent.profileId).toBeNull();
	});

	it("AppError → isError result, reported as an error call", async () => {
		mocks.org.mockResolvedValue(undefined);
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result).toMatchObject({ isError: true, content: [{ text: "Community not found" }] });
		expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
	});

	it("unknown failure → generic Internal error", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		mocks.org.mockRejectedValue(new Error("secret detail"));
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result).toMatchObject({ isError: true, content: [{ text: "Internal error" }] });
		expect(JSON.stringify(result)).not.toContain("secret detail");
	});
});
