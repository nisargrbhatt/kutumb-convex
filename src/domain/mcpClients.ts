/** Pure setup content for each AI Client. One source for the connect drawer and the public guide. */

export const MCP_DOCS_PATH = "/docs/mcp";

export type McpSnippet = { label: string; code: string };

export type McpClient = {
	id: string;
	name: string;
	/** Plain-text steps, in order. */
	steps: string[];
	snippets: McpSnippet[];
};

export function mcpClients(mcpUrl: string): McpClient[] {
	return [
		{
			id: "claude",
			name: "Claude",
			steps: [
				"Open Settings → Connectors on claude.ai (or Claude Desktop).",
				"Choose Add custom connector.",
				"Name it Kutumb and paste the MCP URL.",
				"Click Add, then Connect. Sign in to Kutumb, pick a community and Allow.",
			],
			snippets: [{ label: "MCP URL", code: mcpUrl }],
		},
		{
			id: "chatgpt",
			name: "ChatGPT",
			steps: [
				"Open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.",
				"Back in Apps & Connectors, choose Create.",
				"Name it Kutumb, paste the MCP URL and set authentication to OAuth.",
				"Create, then sign in to Kutumb, pick a community and Allow.",
			],
			snippets: [{ label: "MCP URL", code: mcpUrl }],
		},
		{
			id: "claude-code",
			name: "Claude Code",
			steps: [
				"Run the command below in your terminal.",
				"Start Claude Code and run /mcp, select kutumb, then Authenticate.",
				"Sign in to Kutumb in the browser, pick a community and Allow.",
			],
			snippets: [{ label: "Terminal", code: `claude mcp add --transport http kutumb ${mcpUrl}` }],
		},
		{
			id: "cursor",
			name: "Cursor",
			steps: [
				"Open Cursor Settings → MCP → Add new MCP server (or edit ~/.cursor/mcp.json).",
				"Add the config below and save.",
				"Click Connect next to kutumb. Sign in to Kutumb, pick a community and Allow.",
			],
			snippets: [
				{
					label: "mcp.json",
					code: JSON.stringify({ mcpServers: { kutumb: { url: mcpUrl } } }, null, 2),
				},
			],
		},
	];
}
