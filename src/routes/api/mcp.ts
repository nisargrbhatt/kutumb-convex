import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "@/server/mcp/runtime";

export const Route = createFileRoute("/api/mcp")({
	server: {
		handlers: {
			ANY: ({ request }) => handleMcpRequest(request),
		},
	},
});
