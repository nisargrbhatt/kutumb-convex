import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { defineReadTool } from "./tools/define";
import { whoami, whoamiOutput } from "./tools/whoami";

/** Fresh per request (stateless): no sessions, no Durable Object. */
export function buildMcpServer(): McpServer {
	const server = new McpServer({ name: "kutumb", version: "1.0.0" });

	defineReadTool(
		server,
		"whoami",
		{
			title: "Who am I",
			description:
				"Returns the signed-in member, the community (organization) this connection is scoped to, and their role there.",
			outputSchema: whoamiOutput,
		},
		(actor) => whoami(actor)
	);

	return server;
}

export const createKutumbMcpHandler = () =>
	createMcpHandler(() => buildMcpServer(), {
		legacy: "stateless",
		onerror: (error) => console.error("MCP handler error", error),
	});
