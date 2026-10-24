import type { CallToolResult } from "@modelcontextprotocol/server";
import { isAppError } from "@/domain/errors";

/**
 * Tool failure → `isError` result. NotFound/Forbidden/Invalid carry their (short, user-safe)
 * message (an `Invalid` message includes its hint, e.g. the allowed ops or valid fields);
 * anything else is "Internal error" with the detail only on `console.error`.
 */
export function toolErrorResult(error: unknown): CallToolResult {
	if (
		isAppError(error) &&
		(error.kind === "NotFound" || error.kind === "Forbidden" || error.kind === "Invalid")
	) {
		return { isError: true, content: [{ type: "text", text: error.message }] };
	}
	console.error("MCP tool failed", error);
	return { isError: true, content: [{ type: "text", text: "Internal error" }] };
}
