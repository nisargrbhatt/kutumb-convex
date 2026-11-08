import { and, eq, gte, sql } from "drizzle-orm";
import { mediaBlob } from "@/db/app-schema";
import { changeRequest, communityProfile } from "@/db/schema";
import {
	BLOB_MEDIA_KIND,
	BLOB_STATUS,
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
	/** Session's user id, or null when signed out. */
	getUserId: (request: Request) => Promise<string | null>;
	now: () => Date;
};

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
	// Memory gallery owner check lands with gallery images (ticket 34).
	async memory() {
		return false;
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
export function makeBlobRoute({ db, bucket, getUserId, now }: Deps) {
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
		const userId = await getUserId(request);
		if (!userId) return notFound();
		const actor = await actorIn(organizationId, userId);
		if (!actor) return notFound();

		const row = await db.query.mediaBlob.findFirst({
			where: (f, o) => o.and(o.eq(f.id, blobId), o.eq(f.organizationId, organizationId)),
		});
		if (!row || row.status !== BLOB_STATUS.attached || !row.ownerKind || !row.ownerId) {
			return notFound();
		}
		if (row.variants[variant] === undefined) return notFound();
		if (!(await OWNER_CHECKS[row.ownerKind](db, actor, row.ownerId))) return notFound();

		const contentType = isImageVariant(variant) ? "image/jpeg" : row.contentType;
		if (!contentType) return notFound();

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
