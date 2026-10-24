import type { CallToolResult } from "@modelcontextprotocol/server";
import { isAppError } from "@/domain/errors";
import { limitMessage } from "@/domain/limits";
import { WRITE_DENIED_HINT, type WriteDeniedReason } from "@/domain/mcpWrite";

const text = (message: string): CallToolResult => ({
	isError: true,
	content: [{ type: "text", text: message }],
});

const isWriteDeniedReason = (code: unknown): code is WriteDeniedReason =>
	typeof code === "string" && code in WRITE_DENIED_HINT;

const STALE_HINT =
	"The record changed since you read it. Call get_profile again and retry with its current version.";
const CONFLICT_HINT =
	"Another change landed at the same moment. Call get_profile to see the current state, then retry if it is still needed.";
const LIMIT_HINT =
	"Retrying will not help until something is freed or time passes: tell the user instead of retrying.";

/**
 * Tool failure → `isError` result. NotFound/Forbidden/Invalid carry their (short, user-safe)
 * message (an `Invalid` message includes its hint, e.g. the allowed ops or valid fields);
 * WriteNotAllowed adds its reason and a static reconnect/owner hint; Stale / Conflict / LimitReached
 * carry a static "what to do next" hint (LimitReached shows its limit copy, or the write-quota
 * message with its reset time); anything else is "Internal error" with the detail only on
 * `console.error`.
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
	if (isAppError(error) && error.kind === "Stale") return text(`Stale: ${STALE_HINT}`);
	if (isAppError(error) && error.kind === "Conflict") return text(`Conflict: ${CONFLICT_HINT}`);
	if (isAppError(error) && error.kind === "LimitReached") {
		// Known limit codes carry app copy; others (write quota) carry their own message.
		const detail = limitMessage(error)?.description ?? error.message;
		return text(`LimitReached: ${detail} ${LIMIT_HINT}`);
	}
	console.error("MCP tool failed", error);
	return text("Internal error");
}
