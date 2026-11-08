import { and, eq, gte, not, or, sql } from "drizzle-orm";
import { mediaBlob } from "@/db/app-schema";
import { changeRequest, communityProfile, post } from "@/db/schema";
import {
	BLOB_MEDIA_KIND,
	BLOB_OWNER_KIND,
	BLOB_STATUS,
	COMMUNITY_PROFILE_STATUS,
	BLOB_VARIANT,
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
import type { BlobBucket } from "./blobStore";
import { verifyJpeg } from "./jpeg";
import { IMAGE_VARIANT_MAX_BYTES } from "./limits";
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
 * an `active` profile and an `attached` Memory image whose Memory is in the same org. Covers
 * `pending`, `deleted`, Change Request owned, photos on `inactive` or `draft` profiles, orphans,
 * and kinds without a memo rule yet.
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
							and(
								eq(mediaBlob.ownerKind, BLOB_OWNER_KIND.profile),
								sql`exists (select 1 from ${communityProfile} where ${communityProfile.id} = ${mediaBlob.ownerId} and ${communityProfile.organizationId} = ${mediaBlob.organizationId} and ${communityProfile.status} = ${COMMUNITY_PROFILE_STATUS.active})`
							),
							and(
								eq(mediaBlob.ownerKind, BLOB_OWNER_KIND.memory),
								eq(mediaBlob.mediaKind, BLOB_MEDIA_KIND.memoryImage),
								sql`exists (select 1 from ${post} where ${post.id} = ${mediaBlob.ownerId} and ${post.organizationId} = ${mediaBlob.organizationId})`
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
		// Video verification lands with video (ticket 35).
		if (!isAllowedVariant(row.mediaKind, variant) || !isImageVariant(variant)) {
			return plain(400, "Unknown variant");
		}

		const lengthHeader = request.headers.get("content-length");
		const length = lengthHeader === null ? NaN : Number(lengthHeader);
		if (!Number.isSafeInteger(length) || length <= 0 || !request.body) {
			return plain(411, "Content-Length required");
		}
		if (length > IMAGE_VARIANT_MAX_BYTES) return plain(413, "File too large");
		const landedElsewhere = Object.entries(row.variants)
			.filter(([v]) => v !== variant)
			.reduce((n, [, size]) => n + (size ?? 0), 0);
		const allowance = row.size - landedElsewhere;
		if (length > allowance) return plain(413, "Larger than declared");

		const needsSha = row.mediaKind === BLOB_MEDIA_KIND.profilePhoto && variant === "display";
		const sha256 = request.headers.get(SHA256_HEADER)?.toLowerCase();
		if (needsSha && (!sha256 || !SHA256_RE.test(sha256))) return plain(400, "sha256 required");

		const key = blobKey(organizationId, blobId, variant);
		let object;
		try {
			// R2 checks `sha256` against the bytes, so the Worker never hashes.
			object = await bucket.put(key, request.body, {
				httpMetadata: { contentType: "image/jpeg" },
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

		const verdict = await verifyJpeg(
			async (offset, len) => {
				const part = await bucket.get(key, { range: { offset, length: len } });
				return part ? new Uint8Array(await part.arrayBuffer()) : new Uint8Array(0);
			},
			object.size,
			{ maxEdge: variantMaxEdge(row.mediaKind, variant) ?? 0 }
		);
		if (!verdict.ok) return reject(422, "This photo couldn't be read. Try a different file.");

		// Re-read the row as a conditional write: a Blob discarded (or expired) mid-put must not keep
		// bytes, or they'd sit with no row for the sweep to find.
		const isDisplay = variant === BLOB_VARIANT.display;
		const updated = await db
			.update(mediaBlob)
			.set({
				variants: sql`json_set(${mediaBlob.variants}, ${`$.${variant}`}, ${object.size})`,
				...(isDisplay ? { width: verdict.width, height: verdict.height } : {}),
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
			{ variant, size: object.size, width: verdict.width, height: verdict.height },
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

		// Unrestricted plus member: no D1. Image variants only: `video` reads its type from the row.
		let contentType: string | null = "image/jpeg";
		if (!isImageVariant(variant) || (await isRestricted(organizationId, blobId))) {
			const row = await db.query.mediaBlob.findFirst({
				where: (f, o) => o.and(o.eq(f.id, blobId), o.eq(f.organizationId, organizationId)),
			});
			if (!row || row.status !== BLOB_STATUS.attached || !row.ownerKind || !row.ownerId) {
				return notFound();
			}
			if (row.variants[variant] === undefined) return notFound();
			if (!(await OWNER_CHECKS[row.ownerKind](db, actor, row.ownerId))) return notFound();
			contentType = isImageVariant(variant) ? "image/jpeg" : row.contentType;
			if (!contentType) return notFound();
		}

		const key = blobKey(organizationId, blobId, variant);
		const headers: Record<string, string> = {
			...BASE_HEADERS,
			"Content-Type": contentType,
			"Cache-Control": "private, max-age=86400, immutable",
		};
		if (url.searchParams.get("download") === "1") headers["Content-Disposition"] = "attachment";

		// Never 304 from the ETag alone: once the object is gone a member must get 404.
		const ifNoneMatch = request.headers.get("if-none-match");
		if (ifNoneMatch) {
			const head = await bucket.head(key);
			if (!head) return notFound();
			if (etagMatches(ifNoneMatch, head.httpEtag)) {
				return new Response(null, { status: 304, headers: { ...headers, ETag: head.httpEtag } });
			}
		}

		const object = await bucket.get(key);
		if (!object) return notFound();
		return new Response(object.body, {
			headers: { ...headers, ETag: object.httpEtag, "Content-Length": String(object.size) },
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
