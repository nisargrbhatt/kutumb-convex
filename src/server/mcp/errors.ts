import type { CallToolResult } from "@modelcontextprotocol/server";
import { isAppError } from "@/domain/errors";
import { WRITE_DENIED_HINT, type WriteDeniedReason } from "@/domain/mcpWrite";

const text = (message: string): CallToolResult => ({
	isError: true,
	content: [{ type: "text", text: message }],
});

const isWriteDeniedReason = (code: unknown): code is WriteDeniedReason =>
	typeof code === "string" && code in WRITE_DENIED_HINT;

/**
 * Tool failure → `isError` result. NotFound/Forbidden/Invalid carry their (short, user-safe)
 * message (an `Invalid` message includes its hint, e.g. the allowed ops or valid fields);
 * WriteNotAllowed adds its reason and a static reconnect/owner hint; anything else is
 * "Internal error" with the detail only on `console.error`.
 */
export function toolErrorResult(error: unknown): CallToolResult {
	if (
		isAppError(error) &&
		(error.kind === "NotFound" || error.kind === "Forbidden" || error.kind === "Invalid")
	) {
		return text(error.message);
	}
	if (isAppError(error) && error.kind === "WriteNotAllowed") {
		const reason = isWriteDeniedReason(error.code) ? error.code : "connection_read_only";
		return text(`WriteNotAllowed (${reason}): ${error.message} ${WRITE_DENIED_HINT[reason]}`);
	}
	console.error("MCP tool failed", error);
	return text("Internal error");
}
