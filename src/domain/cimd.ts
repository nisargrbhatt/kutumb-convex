/** Pure CIMD (Client ID Metadata Document) fetch constants + URL guard (no I/O). See ADR 0004. */

export const CIMD_FETCH_TIMEOUT_MS = 5_000;
export const CIMD_MAX_BODY_BYTES = 64 * 1024;
export const CIMD_CACHE_TTL_SECONDS = 60 * 60;

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Why a CIMD metadata URL must not be fetched, or `null` when it may be. https only, no
 * credentials, no IP-literal hosts (WHATWG parsing already normalises decimal/hex/octal IPv4 to
 * dotted form), and never our own origin (a client must not make us fetch ourselves).
 */
export function cimdUrlRejection(rawUrl: string, ownOrigin: string): string | null {
	const url = URL.parse(rawUrl);
	if (!url) return "client_id is not a valid URL";
	if (url.protocol !== "https:") return "client_id URL must use https";
	if (url.username || url.password) return "client_id URL must not contain credentials";
	if (IPV4_LITERAL.test(url.hostname) || url.hostname.includes(":")) {
		return "client_id URL must not use an IP address host";
	}
	// `host.` and `host` are the same server; compare without the trailing root dot.
	const bare = (host: string) => host.replace(/\.$/, "");
	const own = URL.parse(ownOrigin);
	if (own && bare(own.hostname) === bare(url.hostname))
		return "client_id URL must not point at this server";
	return null;
}
