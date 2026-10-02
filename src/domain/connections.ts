/** Pure rules for the Connections page (no I/O). A Connection = one `oauthConsent` row (ADR 0004). */
import { REFRESH_TOKEN_TTL_SECONDS } from "./mcpOauth";

/** No refresh for longer than the refresh-token TTL → the AI Client can no longer reconnect alone. */
export const CONNECTION_EXPIRY_MS = REFRESH_TOKEN_TTL_SECONDS * 1000;

export type ConnectionStatus = "active" | "expired";

export type ConnectionActivityInput = {
	connectedAt: number;
	/** Refresh tokens issued for this Connection: the first at connect time, one more per refresh. */
	tokenCount: number;
	newestTokenAt: number | null;
};

/**
 * "Last used" is the newest refresh-token issue time, accurate to ~1h (access-token TTL) with no
 * per-call writes. The first token is issued at connect time, so it only counts once a refresh
 * has happened; before that → `null` ("Never").
 */
export function connectionActivity(
	{ connectedAt, tokenCount, newestTokenAt }: ConnectionActivityInput,
	now: number
): { lastUsedAt: number | null; status: ConnectionStatus } {
	const lastUsedAt = tokenCount > 1 ? newestTokenAt : null;
	const lastSeen = newestTokenAt ?? connectedAt;
	return {
		lastUsedAt,
		status: now - lastSeen > CONNECTION_EXPIRY_MS ? "expired" : "active",
	};
}
