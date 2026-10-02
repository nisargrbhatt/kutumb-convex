import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import {
	CIMD_CACHE_TTL_SECONDS,
	CIMD_FETCH_TIMEOUT_MS,
	CIMD_MAX_BODY_BYTES,
	cimdUrlRejection,
} from "@/domain/cimd";
import { safeAsync, safeSync } from "./safe";

type CimdFetcherDeps = {
	kv: KVNamespace;
	ownOrigin: string;
	fetch?: typeof fetch;
	timeoutMs?: number;
};

type CachedDocument = { body: string; contentType: string; storedAt: number };

const cacheKey = (url: string) => `cimd:${url}`;

/** A corrupt or old-shape entry is a cache miss, never a failed OAuth flow. */
async function readCache(kv: KVNamespace, url: string): Promise<CachedDocument | null> {
	const read = await safeAsync(kv.get(cacheKey(url)));
	const raw = read.success ? read.data : null;
	if (!raw) return null;
	const parsed = safeSync(() => JSON.parse(raw) as Partial<CachedDocument>);
	if (!parsed.success) return null;
	const { body, contentType, storedAt } = parsed.data ?? {};
	if (typeof body !== "string" || typeof contentType !== "string" || typeof storedAt !== "number") {
		return null;
	}
	return { body, contentType, storedAt };
}

function inputUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") return input;
	return input instanceof URL ? input.href : input.url;
}

const tooLarge = () => new Error("CIMD metadata document too large");

/** Read at most `max` bytes; `signal` aborts a stalled body. */
async function readCapped(response: Response, max: number, signal: AbortSignal): Promise<string> {
	const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10);
	if (Number.isFinite(declared) && declared > max) {
		await response.body?.cancel();
		throw tooLarge();
	}
	const reader = response.body?.getReader();
	if (!reader) return "";
	const onAbort = () => void reader.cancel().catch(() => {});
	signal.addEventListener("abort", onAbort, { once: true });
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (signal.aborted) throw new Error("CIMD metadata fetch timed out");
			if (done) break;
			size += value.byteLength;
			if (size > max) {
				await reader.cancel();
				throw tooLarge();
			}
			chunks.push(value);
		}
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

/** `client_id` of a JSON object body, `undefined` for anything else (e.g. a JWKS). */
function documentClientId(body: string): string | undefined {
	try {
		const parsed: unknown = JSON.parse(body);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const id = (parsed as { client_id?: unknown }).client_id;
		return typeof id === "string" ? id : undefined;
	} catch {
		return undefined;
	}
}

/**
 * `fetchClientMetadataResource` for `@better-auth/cimd` on Workers. The plugin's own transport
 * helper is Node-only. Guards: https, no IP-literal or own-origin host, redirects refused, 5s
 * timeout, 64KB cap, document `client_id` must equal its URL. Documents are cached in KV ~1h
 * (isolates are short-lived, so the plugin's in-memory cache alone isn't enough); KV errors are
 * cache misses.
 *
 * Workers can't pin DNS, but `global_fetch_strictly_public` makes the runtime refuse private
 * addresses, which covers the rebinding half of the SSRF surface.
 */
export function createCimdFetcher({
	kv,
	ownOrigin,
	fetch: fetchImpl = fetch,
	timeoutMs = CIMD_FETCH_TIMEOUT_MS,
}: CimdFetcherDeps): ClientMetadataResourceFetch {
	return async (input, init) => {
		const url = inputUrl(input);
		const rejection = cimdUrlRejection(url, ownOrigin);
		if (rejection) throw new Error(rejection);

		const cached = await readCache(kv, url);
		if (cached) {
			const remaining = Math.max(
				0,
				CIMD_CACHE_TTL_SECONDS - Math.floor((Date.now() - cached.storedAt) / 1000)
			);
			return new Response(cached.body, {
				status: 200,
				headers: { "content-type": cached.contentType, "cache-control": `max-age=${remaining}` },
			});
		}

		const timeout = AbortSignal.timeout(timeoutMs);
		const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
		const response = await fetchImpl(url, { ...init, redirect: "manual", signal });
		if (
			response.type === "opaqueredirect" ||
			(response.status >= 300 && response.status < 400 && response.status !== 304)
		) {
			await response.body?.cancel();
			throw new Error("CIMD metadata fetch must not follow redirects");
		}

		const body = await readCapped(response, CIMD_MAX_BODY_BYTES, signal);
		const contentType = response.headers.get("content-type") ?? "application/json";
		const headers = new Headers(response.headers);
		headers.delete("content-length");
		headers.delete("content-encoding");
		const passthrough = () =>
			new Response(response.status === 304 ? null : body, { status: response.status, headers });

		if (response.status !== 200) return passthrough();
		const clientId = documentClientId(body);
		if (clientId === undefined) return passthrough();
		if (clientId !== url) throw new Error("CIMD metadata client_id does not match its URL");

		const entry: CachedDocument = { body, contentType, storedAt: Date.now() };
		// Best effort: KV limits writes per key, and a valid document must not fail on a cache write.
		await safeAsync(
			kv.put(cacheKey(url), JSON.stringify(entry), { expirationTtl: CIMD_CACHE_TTL_SECONDS })
		);
		return passthrough();
	};
}
