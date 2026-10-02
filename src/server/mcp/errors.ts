import type { CallToolResult } from "@modelcontextprotocol/server";
import { isAppError } from "@/domain/errors";

/**
 * Tool failure → `isError` result. NotFound/Forbidden carry their (short, user-safe) message;
 * anything else is "Internal error" with the detail only on `console.error`.
 */
export function toolErrorResult(error: unknown): CallToolResult {
	if (isAppError(error) && (error.kind === "NotFound" || error.kind === "Forbidden")) {
		return { isError: true, content: [{ type: "text", text: error.message }] };
	}
	console.error("MCP tool failed", error);
	return { isError: true, content: [{ type: "text", text: "Internal error" }] };
}
