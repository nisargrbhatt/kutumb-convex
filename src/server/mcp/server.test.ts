import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/domain/permission";

const mocks = vi.hoisted(() => ({
	org: vi.fn(),
	profile: vi.fn(),
	capture: vi.fn(),
}));

vi.mock("@/db", () => ({
	db: {
		query: {
			organization: { findFirst: mocks.org },
			communityProfile: { findFirst: mocks.profile },
		},
	},
}));
vi.mock("@/lib/posthog-server", () => ({ captureMcpToolCalled: mocks.capture }));

const { createKutumbMcpHandler } = await import("./server");

const ACTOR: Actor = { userId: "u1", organizationId: "o1", role: "admin" };
const authInfo = {
	token: "t",
	clientId: "c1",
	scopes: ["community:read"],
	extra: { actor: ACTOR },
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
	mocks.org.mockResolvedValue({ id: "o1", name: "Patel Parivar" });
	mocks.profile.mockResolvedValue({ id: "p1" });
});

describe("MCP server (stateless, 2025 Streamable HTTP)", () => {
	it("tools/list advertises read-only whoami with an output schema", async () => {
		const { result } = await rpc("tools/list");
		expect(result.tools).toHaveLength(1);
		expect(result.tools[0]).toMatchObject({
			name: "whoami",
			annotations: { readOnlyHint: true },
			outputSchema: { type: "object" },
		});
	});

	it("whoami returns org, role and profile for the Actor", async () => {
		const { result } = await rpc("tools/call", { name: "whoami", arguments: {} });
		expect(result.structuredContent).toEqual({
			userId: "u1",
			organization: { id: "o1", name: "Patel Parivar" },
			role: "admin",
			profileId: "p1",
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
