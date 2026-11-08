import {
	BLOB_STATUS,
	BLOB_VARIANT,
	type BlobMediaKind,
	type BlobStatus,
	type BlobVariant,
} from "@/db/constants";
import type { Actor } from "./permission";

/** Pure Blob rules (spec: Blobs). Client-safe: no `@/lib` or server imports. */

export const BLOB_PATH_PREFIX = "/api/blob/";

/** `pending` rows expire this long after `createdAt`. */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

type VariantSpec = { required: boolean; maxEdge: number | null };

/** Variants per `mediaKind`: required or optional, and longest edge in px (null: not an image). */
const VARIANTS = {
	profilePhoto: {
		avatar: { required: true, maxEdge: 128 },
		display: { required: true, maxEdge: 1024 },
	},
	memoryImage: {
		thumb: { required: true, maxEdge: 640 },
		display: { required: true, maxEdge: 2048 },
	},
	memoryVideo: {
		video: { required: true, maxEdge: null },
		poster: { required: false, maxEdge: 1280 },
	},
} as const satisfies Record<BlobMediaKind, Partial<Record<BlobVariant, VariantSpec>>>;

const specOf = (kind: BlobMediaKind, variant: string): VariantSpec | undefined =>
	(VARIANTS[kind] as Partial<Record<string, VariantSpec>>)[variant];

export const isAllowedVariant = (kind: BlobMediaKind, variant: string): variant is BlobVariant =>
	Object.hasOwn(VARIANTS[kind], variant);

/** Variants of `kind`, required first in declared order. */
export const variantsOf = (kind: BlobMediaKind) => Object.keys(VARIANTS[kind]) as BlobVariant[];

export const isImageVariant = (variant: BlobVariant) => variant !== BLOB_VARIANT.video;

/** Longest edge allowed for an image variant; null for `video`. */
export const variantMaxEdge = (kind: BlobMediaKind, variant: BlobVariant) =>
	specOf(kind, variant)?.maxEdge ?? null;

export type LandedVariants = Partial<Record<BlobVariant, number>>;

/** Required variants of `kind` not yet in `landed`. */
export const missingVariants = (kind: BlobMediaKind, landed: LandedVariants) =>
	variantsOf(kind).filter((v) => specOf(kind, v)?.required && landed[v] === undefined);

/** R2 key, stable from upload to delete. */
export const blobKey = (organizationId: string, blobId: string, variant: BlobVariant) =>
	`${organizationId}/${blobId}/${variant}`;

/** Stable same-origin URL; cached data holds ids only and builds this on the client. */
export const blobUrl = (
	organizationId: string,
	blobId: string,
	variant: BlobVariant,
	{ download = false }: { download?: boolean } = {}
) =>
	`${BLOB_PATH_PREFIX}${encodeURIComponent(organizationId)}/${encodeURIComponent(blobId)}/${variant}${download ? "?download=1" : ""}`;

const ID_RE = /^[A-Za-z0-9_-]+$/;

/** `/api/blob/<orgId>/<blobId>/<variant>` or null. */
export function parseBlobPath(
	pathname: string
): { organizationId: string; blobId: string; variant: BlobVariant } | null {
	if (!pathname.startsWith(BLOB_PATH_PREFIX)) return null;
	const parts = pathname.slice(BLOB_PATH_PREFIX.length).split("/");
	if (parts.length !== 3) return null;
	const [organizationId, blobId, variant] = parts as [string, string, string];
	if (!ID_RE.test(organizationId) || !ID_RE.test(blobId)) return null;
	if (!Object.hasOwn(BLOB_VARIANT, variant)) return null;
	return { organizationId, blobId, variant: variant as BlobVariant };
}

export const isPendingExpired = (createdAt: Date, now: Date) =>
	now.getTime() - createdAt.getTime() > PENDING_TTL_MS;

/** Oldest `createdAt` a `pending` row may have and still count. */
export const pendingCutoff = (now: Date) => new Date(now.getTime() - PENDING_TTL_MS);

export type AttachableBlob = {
	organizationId: string;
	mediaKind: BlobMediaKind;
	status: BlobStatus;
	uploadedByUserId: string;
	variants: LandedVariants;
	createdAt: Date;
};

/**
 * Attach rule (spec: Blobs > Lifecycle): `pending`, unexpired, in the Actor's active org, uploaded
 * by the Actor, `mediaKind` fits the slot, required variants landed.
 */
export const canAttach = (
	blob: AttachableBlob,
	{ actor, mediaKind, now }: { actor: Actor; mediaKind: BlobMediaKind; now: Date }
) =>
	blob.status === BLOB_STATUS.pending &&
	!isPendingExpired(blob.createdAt, now) &&
	blob.organizationId === actor.organizationId &&
	blob.uploadedByUserId === actor.userId &&
	blob.mediaKind === mediaKind &&
	missingVariants(blob.mediaKind, blob.variants).length === 0;
