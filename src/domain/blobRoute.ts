import { and, eq, gte, not, or, sql } from "drizzle-orm";
import { mediaBlob } from "@/db/app-schema";
import { changeRequest, communityProfile, post } from "@/db/schema";
import {
	BLOB_MEDIA_KIND,
	BLOB_STATUS,
	BLOB_VARIANT,
	BLOB_VIDEO_CONTENT_TYPE,
	ORGANIZATION_ROLES,
	type BlobOwnerKind,
	type BlobVariant,
} from "@/db/constants";
import {
	blobKey,
	isAllowedVariant,
	isImageVariant,
	isPendingExpired,
	parseBlobPath,
	pendingCutoff,
	variantMaxEdge,
} from "./blob";
import { variantMaxBytes, type BlobBucket, type BlobObject, type BlobRange } from "./blobStore";
import { BLOB_OWNER_SQL } from "./blobOwner";
import { verifyJpeg, type ReadRange } from "./jpeg";
import { verifyVideo } from "./video";
import type { Actor, Role } from "./permission";
import { visibleProfileWhere } from "./queries/profiles";
import type { QueryDb } from "./queries/db";

/** Header carrying the browser-computed hex sha256 of a `profilePhoto` `display`. */
export const SHA256_HEADER = "x-blob-sha256";

const SHA256_RE = /^[0-9a-f]{64}$/;

const BASE_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Content-Security-Policy": "sandbox",
};

const plain = (status: number, text: string, extra: Record<string, string> = {}) =>
	new Response(text, {
		status,
		headers: { ...BASE_HEADERS, "Cache-Control": "no-store", ...extra },
	});

/** One identical response for every "you can't see this" case. */
const notFound = () => plain(404, "Not found");

type Deps = {
	db: QueryDb;
	bucket: BlobBucket;
	/** Session's user id, or null when signed out. Reads D1: only on a memo miss. */
	getUserId: (request: Request) => Promise<string | null>;
	/** Raw session cookie value (no D1), the memo key; null when absent. */
	sessionToken: (request: Request) => string | null;
	now: () => Date;
};

/** Isolate memo lifetime (spec: Serving > Gate). Accepted lag for role and visibility changes. */
export const GATE_MEMO_TTL_MS = 30_000;
/** Entries per memo map; oldest goes first past this. */
const GATE_MEMO_MAX = 1000;

/** Plain-data, TTL'd, size-capped isolate memo. */
function ttlMemo<V>(now: () => Date) {
	const entries = new Map<string, { at: number; value: V }>();
	return {
		get(key: string): V | undefined {
			const hit = entries.get(key);
			if (!hit) return undefined;
			if (now().getTime() - hit.at >= GATE_MEMO_TTL_MS) {
				entries.delete(key);
				return undefined;
			}
			return hit.value;
		},
		set(key: string, value: V) {
			entries.delete(key);
			if (entries.size >= GATE_MEMO_MAX) entries.delete(entries.keys().next().value!);
			entries.set(key, { at: now().getTime(), value });
		},
	};
}

const sha256Hex = async (text: string) =>
	Array.from(
		new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))),
		(b) => b.toString(16).padStart(2, "0")
	).join("");

/**
 * Restricted Blobs of an org: everything but the cases any member may see, an `attached` photo on
 * an `active` profile and `attached` Memory media (image or video) whose Memory is in the same org.
 * Covers `pending`, `deleted`, Change Request owned, photos on `inactive` or `draft` profiles, and
 * orphans. Video range requests then hit the memo with no D1 read.
 */
async function restrictedBlobIds(db: QueryDb, organizationId: string) {
	const rows = await db
		.select({ id: mediaBlob.id })
		.from(mediaBlob)
		.where(
			and(
				eq(mediaBlob.organizationId, organizationId),
				not(
					and(
						eq(mediaBlob.status, BLOB_STATUS.attached),
						or(
							...Object.entries(BLOB_OWNER_SQL).flatMap(([kind, { memberVisible }]) =>
								memberVisible
									? [and(eq(mediaBlob.ownerKind, kind as BlobOwnerKind), memberVisible)]
									: []
							)
						)
					)!
				)
			)
		);
	return new Set(rows.map((r) => r.id));
}

/**
 * Owning-record check per owner kind (spec: Serving > Gate). A `Record` so a new kind fails to
 * compile until it says who may read.
 */
const OWNER_CHECKS: Record<
	BlobOwnerKind,
	(db: QueryDb, actor: Actor, ownerId: string) => Promise<boolean>
> = {
	async profile(db, actor, ownerId) {
		const [row] = await db
			.select({ id: communityProfile.id })
			.from(communityProfile)
			.where(and(eq(communityProfile.id, ownerId), visibleProfileWhere(actor)))
			.limit(1);
		return row !== undefined;
	},
	async changeRequest(db, actor, ownerId) {
		const [row] = await db
			.select({ submitterUserId: changeRequest.submitterUserId })
			.from(changeRequest)
			.where(
				and(eq(changeRequest.id, ownerId), eq(changeRequest.organizationId, actor.organizationId))
			)
			.limit(1);
		if (!row) return false;
		return row.submitterUserId === actor.userId || actor.role !== ORGANIZATION_ROLES.member;
	},
	/** Any member of the Memory's org: the Feed has no per-Post visibility. */
	async memory(db, actor, ownerId) {
		const [row] = await db
			.select({ id: post.id })
			.from(post)
			.where(and(eq(post.id, ownerId), eq(post.organizationId, actor.organizationId)))
			.limit(1);
		return row !== undefined;
	},
};

const etagMatches = (ifNoneMatch: string, etag: string) =>
	ifNoneMatch
		.split(",")
		.map((t) => t.trim().replace(/^W\//, ""))
		.some((t) => t === "*" || t === etag);

/**
 * One `Range: bytes=…` as an R2 range (spec: Serving > Range). Multi-range, other units and junk
 * read as null: the whole file with `200`.
 */
export function parseRange(header: string | null): BlobRange | null {
	const m = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
	if (!m) return null;
	const [, from, to] = m as unknown as [string, string, string];
	if (from === "") {
		const suffix = Number(to);
		return to !== "" && suffix > 0 && Number.isSafeInteger(suffix) ? { suffix } : null;
	}
	const offset = Number(from);
	if (!Number.isSafeInteger(offset)) return null;
	if (to === "") return { offset };
	const end = Number(to);
	if (!Number.isSafeInteger(end) || end < offset) return null;
	return { offset, length: end - offset + 1 };
}

/** First and last byte served of an object of `size`, as R2 clamps `range`. */
const servedRange = (range: BlobRange, size: number) => {
	const offset = "suffix" in range ? Math.max(0, size - range.suffix) : range.offset;
	const length = "suffix" in range ? size - offset : Math.min(range.length ?? size, size - offset);
	return { first: offset, last: offset + length - 1, length };
};

/** `If-Range` holds when it names the current ETag (strong compare). A date never holds. */
const ifRangeHolds = (ifRange: string, etag: string) => ifRange.trim() === etag;

const VIDEO_TYPES: readonly string[] = Object.values(BLOB_VIDEO_CONTENT_TYPE);

/**
 * `Content-Type` from the allow-list, never a client's raw value: `image/jpeg` for image variants,
 * the type stored in `put()`'s `httpMetadata` (from the row) for `video`.
 */
const servedType = (variant: BlobVariant, object: BlobObject) => {
	if (isImageVariant(variant)) return "image/jpeg";
	const stored = object.httpMetadata?.contentType;
	return stored && VIDEO_TYPES.includes(stored) ? stored : null;
};

/**
 * `/api/blob/<orgId>/<blobId>/<variant>`, ahead of TanStack (spec: Upload, Serving). `PUT` lands
 * one variant of a `pending` Blob; `GET` serves an attached one after the full owning-record check.
 */
export function makeBlobRoute({ db, bucket, getUserId, sessionToken, now }: Deps) {
	/** `sha256(session cookie)` → user and role per org. */
	const sessions = ttlMemo<{ userId: string; roles: Record<string, Role> }>(now);
	/** `orgId` → restricted Blob ids. */
	const restricted = ttlMemo<Set<string>>(now);

	/** Actor in the URL's org via the memo; on a miss reads the session and memberships live. */
	async function memoActor(request: Request, organizationId: string): Promise<Actor | null> {
		const token = sessionToken(request);
		if (!token) return null;
		const key = await sha256Hex(token);
		let session = sessions.get(key);
		if (!session) {
			const userId = await getUserId(request);
			if (!userId) return null;
			const rows = await db.query.member.findMany({
				where: (f, o) => o.eq(f.userId, userId),
				columns: { organizationId: true, role: true },
			});
			session = {
				userId,
				roles: Object.fromEntries(rows.map((r) => [r.organizationId, r.role as Role])),
			};
			sessions.set(key, session);
		}
		const role = Object.hasOwn(session.roles, organizationId)
			? session.roles[organizationId]
			: undefined;
		return role ? { userId: session.userId, organizationId, role } : null;
	}

	async function isRestricted(organizationId: string, blobId: string) {
		let ids = restricted.get(organizationId);
		if (!ids) {
			ids = await restrictedBlobIds(db, organizationId);
			restricted.set(organizationId, ids);
		}
		return ids.has(blobId);
	}

	/** Actor in the URL's org (never the active org), or null for a non-member. */
	async function actorIn(organizationId: string, userId: string): Promise<Actor | null> {
		const m = await db.query.member.findFirst({
			where: (f, o) => o.and(o.eq(f.organizationId, organizationId), o.eq(f.userId, userId)),
			columns: { role: true },
		});
		return m ? { userId, organizationId, role: m.role as Role } : null;
	}

	async function upload(
		request: Request,
		organizationId: string,
		blobId: string,
		variant: BlobVariant
	) {
		const origin = request.headers.get("origin");
		if (origin !== new URL(request.url).origin) return plain(403, "Forbidden");

		const userId = await getUserId(request);
		if (!userId) return plain(401, "Sign in to upload");
		if (!(await actorIn(organizationId, userId))) return notFound();

		const row = await db.query.mediaBlob.findFirst({
			where: (f, o) => o.and(o.eq(f.id, blobId), o.eq(f.organizationId, organizationId)),
		});
		if (!row || row.uploadedByUserId !== userId) return notFound();
		if (row.status !== BLOB_STATUS.pending || isPendingExpired(row.createdAt, now())) {
			return plain(409, "Upload no longer open");
		}
		if (!isAllowedVariant(row.mediaKind, variant)) return plain(400, "Unknown variant");
		const isVideo = variant === BLOB_VARIANT.video;
		// Declared at start; stored as `httpMetadata` so serving needs no D1.
		const contentType = isVideo ? row.contentType : "image/jpeg";
		if (!contentType) return plain(400, "Unknown video type");

		const lengthHeader = request.headers.get("content-length");
		const length = lengthHeader === null ? NaN : Number(lengthHeader);
		if (!Number.isSafeInteger(length) || length <= 0 || !request.body) {
			return plain(411, "Content-Length required");
		}
		if (length > variantMaxBytes(variant)) return plain(413, "File too large");
		const landedElsewhere = Object.entries(row.variants)
			.filter(([v]) => v !== variant)
			.reduce((n, [, size]) => n + (size ?? 0), 0);
		const allowance = row.size - landedElsewhere;
		if (length > allowance) return plain(413, "Larger than declared");

		const needsSha =
			row.mediaKind === BLOB_MEDIA_KIND.profilePhoto && variant === BLOB_VARIANT.display;
		const sha256 = request.headers.get(SHA256_HEADER)?.toLowerCase();
		if (needsSha && (!sha256 || !SHA256_RE.test(sha256))) return plain(400, "sha256 required");

		const key = blobKey(organizationId, blobId, variant);
		let object;
		try {
			// R2 checks `sha256` against the bytes, so the Worker never hashes.
			object = await bucket.put(key, request.body, {
				httpMetadata: { contentType },
				...(needsSha ? { sha256 } : {}),
			});
		} catch {
			return plain(400, "Upload rejected");
		}
		const reject = async (status: number, text: string) => {
			await bucket.delete(key);
			return plain(status, text);
		};
		if (!object) return reject(400, "Upload rejected");
		// put()'s result is R2's own metadata for the landed object: the head() size check.
		if (object.size > allowance) return reject(413, "Larger than declared");

		const readRange: ReadRange = async (offset, len) => {
			const part = await bucket.get(key, { range: { offset, length: len } });
			return part ? new Uint8Array(await part.arrayBuffer()) : new Uint8Array(0);
		};
		let measured: { width: number; height: number; durationMs?: number } | null = null;
		if (isVideo) {
			const verdict = await verifyVideo(readRange, object.size);
			// The walk's type must be the one declared at start, which `put()` stored.
			if (!verdict.ok || verdict.contentType !== contentType) {
				return reject(422, "This video couldn't be read. Try a different file.");
			}
			measured = verdict;
		} else {
			const verdict = await verifyJpeg(readRange, object.size, {
				maxEdge: variantMaxEdge(row.mediaKind, variant) ?? 0,
			});
			if (!verdict.ok) return reject(422, "This photo couldn't be read. Try a different file.");
			// `display` sizes an image Blob; `poster` never overrides the video's own size.
			if (variant === BLOB_VARIANT.display) measured = verdict;
		}

		// Re-read the row as a conditional write: a Blob discarded (or expired) mid-put must not keep
		// bytes, or they'd sit with no row for the sweep to find.
		const updated = await db
			.update(mediaBlob)
			.set({
				variants: sql`json_set(${mediaBlob.variants}, ${`$.${variant}`}, ${object.size})`,
				...(measured ? { width: measured.width, height: measured.height } : {}),
				...(measured?.durationMs !== undefined ? { durationMs: measured.durationMs } : {}),
				...(needsSha ? { sha256 } : {}),
			})
			.where(
				and(
					eq(mediaBlob.id, blobId),
					eq(mediaBlob.status, BLOB_STATUS.pending),
					gte(mediaBlob.createdAt, pendingCutoff(now()))
				)
			)
			.returning({ id: mediaBlob.id });
		if (updated.length === 0) return reject(409, "Upload no longer open");

		return Response.json(
			{ variant, size: object.size },
			{ headers: { ...BASE_HEADERS, "Cache-Control": "no-store" } }
		);
	}

	async function serve(
		request: Request,
		url: URL,
		organizationId: string,
		blobId: string,
		variant: BlobVariant
	) {
		const actor = await memoActor(request, organizationId);
		if (!actor) return notFound();

		// Unrestricted plus member: no D1. Content type comes from the object's `httpMetadata`.
		if (await isRestricted(organizationId, blobId)) {
			const row = await db.query.mediaBlob.findFirst({
				where: (f, o) => o.and(o.eq(f.id, blobId), o.eq(f.organizationId, organizationId)),
			});
			if (!row || row.status !== BLOB_STATUS.attached || !row.ownerKind || !row.ownerId) {
				return notFound();
			}
			if (row.variants[variant] === undefined) return notFound();
			if (!(await OWNER_CHECKS[row.ownerKind](db, actor, row.ownerId))) return notFound();
		}

		const key = blobKey(organizationId, blobId, variant);
		const headersFor = (object: BlobObject) => {
			const contentType = servedType(variant, object);
			if (!contentType) return null;
			const headers: Record<string, string> = {
				...BASE_HEADERS,
				"Content-Type": contentType,
				"Cache-Control": "private, max-age=86400, immutable",
				"Accept-Ranges": "bytes",
				ETag: object.httpEtag,
			};
			if (url.searchParams.get("download") === "1") headers["Content-Disposition"] = "attachment";
			return headers;
		};

		// Never 304 from the ETag alone: once the object is gone a member must get 404.
		const ifNoneMatch = request.headers.get("if-none-match");
		let range = parseRange(request.headers.get("range"));
		const ifRange = request.headers.get("if-range");
		if (ifNoneMatch || (range && ifRange)) {
			const head = await bucket.head(key);
			const headers = head && headersFor(head);
			if (!head || !headers) return notFound();
			if (ifNoneMatch && etagMatches(ifNoneMatch, head.httpEtag)) {
				return new Response(null, { status: 304, headers });
			}
			// A stale `If-Range` gets the whole, current file.
			if (ifRange && !ifRangeHolds(ifRange, head.httpEtag)) range = null;
		}

		// WebKit opens with a `0-1` probe and needs a real `206` (spec: Serving > Range).
		let object;
		try {
			object = await bucket.get(key, range ? { range } : {});
		} catch (error) {
			if (!range) throw error;
			// R2 throws on a start at or past the end.
			const head = await bucket.head(key);
			if (!head) return notFound();
			return plain(416, "Range not satisfiable", { "Content-Range": `bytes */${head.size}` });
		}
		if (!object) return notFound();
		const headers = headersFor(object);
		if (!headers) return notFound();
		if (!range) {
			return new Response(object.body, {
				headers: { ...headers, "Content-Length": String(object.size) },
			});
		}
		const served = servedRange(range, object.size);
		return new Response(object.body, {
			status: 206,
			headers: {
				...headers,
				"Content-Length": String(served.length),
				"Content-Range": `bytes ${served.first}-${served.last}/${object.size}`,
			},
		});
	}

	return {
		async fetch(request: Request): Promise<Response> {
			const url = new URL(request.url);
			const path = parseBlobPath(url.pathname);
			if (!path) return notFound();
			const { organizationId, blobId, variant } = path;
			if (request.method === "PUT") return upload(request, organizationId, blobId, variant);
			if (request.method === "GET") return serve(request, url, organizationId, blobId, variant);
			return plain(405, "Method not allowed", { Allow: "GET, PUT" });
		},
	};
}
