import { describe, expect, it } from "vitest";
import { MCP_DOCS_PATH, mcpClients } from "./mcpClients";

const URL_ = "https://kutumb.example.org/api/mcp";

describe("mcpClients", () => {
	const clients = mcpClients(URL_);

	it("covers Claude, ChatGPT, Claude Code, Cursor with unique ids", () => {
		expect(clients.map((c) => c.name)).toEqual(["Claude", "ChatGPT", "Claude Code", "Cursor"]);
		expect(new Set(clients.map((c) => c.id)).size).toBe(clients.length);
	});

	it("every client has steps", () => {
		for (const c of clients) expect(c.steps.length).toBeGreaterThan(0);
	});

	it("derives snippets from the given URL, never a hardcoded one", () => {
		const other = mcpClients("http://localhost:3000/api/mcp");
		for (const c of other)
			for (const s of c.snippets) {
				expect(s.code).toContain("http://localhost:3000/api/mcp");
				expect(s.code).not.toContain("example.org");
			}
	});

	it("Cursor snippet is valid JSON pointing at the URL", () => {
		const cursor = clients.find((c) => c.id === "cursor")!;
		const parsed = JSON.parse(cursor.snippets[0]!.code);
		expect(parsed.mcpServers.kutumb.url).toBe(URL_);
	});

	it("Claude Code snippet registers an http transport", () => {
		const cc = clients.find((c) => c.id === "claude-code")!;
		expect(cc.snippets[0]!.code).toBe(`claude mcp add --transport http kutumb ${URL_}`);
	});
});

describe("MCP_DOCS_PATH", () => {
	it("is the public guide route", () => {
		expect(MCP_DOCS_PATH).toBe("/docs/mcp");
	});
});
