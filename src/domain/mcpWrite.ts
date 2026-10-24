/** Pure write-gating rules for AI Clients (ADR 0006). No I/O. */
import { parseScopes } from "./mcpEndpoint";
import { MCP_WRITE_SCOPE } from "./mcpOauth";

/** Why this Connection can't write right now. `org_writes_off` wins: reconnecting wouldn't help. */
export type WriteDeniedReason = "connection_read_only" | "org_writes_off";

export type WriteAccess = { canWrite: true } | { canWrite: false; reason: WriteDeniedReason };

export const READ_ONLY: WriteAccess = { canWrite: false, reason: "connection_read_only" };

export const WRITE_DENIED_MESSAGE: Record<WriteDeniedReason, string> = {
	connection_read_only: "This connection is read only.",
	org_writes_off: "The community owner turned off AI Client writes.",
};

export const WRITE_DENIED_HINT: Record<WriteDeniedReason, string> = {
	connection_read_only:
		"To allow changes, reconnect Kutumb in your AI app (remove and re-add it) and choose 'Read and make changes'.",
	org_writes_off: "Ask the community owner to turn AI Client writes back on in Settings → AI.",
};

/**
 * Write needs all three: the token's scope, the Connection's live consent scopes and the org
 * toggle (missing row = on). The token claim alone is never enough.
 */
export function resolveWriteAccess(input: {
	tokenScopes: readonly string[];
	consentScopes: string | null | undefined;
	orgWritesOn: boolean;
}): WriteAccess {
	if (!input.orgWritesOn) return { canWrite: false, reason: "org_writes_off" };
	if (
		input.tokenScopes.includes(MCP_WRITE_SCOPE) &&
		parseScopes(input.consentScopes).includes(MCP_WRITE_SCOPE)
	) {
		return { canWrite: true };
	}
	return READ_ONLY;
}
