import { BLOB_MEDIA_KIND, BLOB_VIDEO_CONTENT_TYPE, type BlobMediaKind } from "@/db/constants";
import type { GalleryItem } from "./feed";

/** Memory gallery rules (spec: Feed UI > Card, Lightbox). Pure and client-safe. */

/** `mediaKind`s a gallery slot accepts. */
export const GALLERY_MEDIA_KINDS: readonly BlobMediaKind[] = [
	BLOB_MEDIA_KIND.memoryImage,
	BLOB_MEDIA_KIND.memoryVideo,
];

export const isGalleryMediaKind = (kind: BlobMediaKind) => GALLERY_MEDIA_KINDS.includes(kind);

/**
 * Gallery column as read by SQLite's `json_group_array`: a JSON string of items with `position`,
 * possibly unordered. Returns the items in position order.
 */
export function parseGallery(value: unknown): GalleryItem[] {
	if (typeof value !== "string") return [];
	let rows: unknown;
	try {
		rows = JSON.parse(value);
	} catch {
		return [];
	}
	if (!Array.isArray(rows)) return [];
	return (rows as (GalleryItem & { position: number })[])
		.filter((r) => r && typeof r.blobId === "string")
		.sort((a, b) => a.position - b.position)
		.map(({ blobId, mediaKind, width, height, durationMs, contentType, hasPoster }) => ({
			blobId,
			mediaKind,
			width: width ?? null,
			height: height ?? null,
			durationMs: durationMs ?? null,
			contentType: contentType ?? null,
			// SQLite's JSON gives the flag as 0 / 1.
			hasPoster: Boolean(hasPoster),
		}));
}

/** Video badge duration: `m:ss`, rounded down. */
export function formatDuration(ms: number) {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Download name for a video (spec: Feed UI > Video): `<title>-2.mov`. */
export function videoDownloadName(title: string, index: number, contentType: string | null) {
	const ext = contentType === BLOB_VIDEO_CONTENT_TYPE.mp4 ? "mp4" : "mov";
	const base = title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "video";
	return `${base}-${index + 1}.${ext}`;
}

/** Single-item mosaic keeps its shape, held between 4:5 and 1.9:1. Unknown size reads as 4:3. */
export function singleRatio(item: Pick<GalleryItem, "width" | "height">) {
	const { width, height } = item;
	const ratio = width && height ? width / height : 4 / 3;
	return Math.min(1.9, Math.max(0.8, ratio));
}

/**
 * Mosaic for 1 to 5 (spec: Feed UI > Card): 2 side by side, 3 one large plus two, 4 a 2x2, 5 two
 * over three. Grid classes for the box and each tile; 1 uses `singleRatio` instead.
 */
export function mosaicLayout(n: number): { box: string; tiles: string[] } | null {
	switch (n) {
		case 2:
			return { box: "aspect-[2/1] grid-cols-2", tiles: ["", ""] };
		case 3:
			return { box: "aspect-[3/2] grid-cols-2 grid-rows-2", tiles: ["row-span-2", "", ""] };
		case 4:
			return { box: "aspect-[4/3] grid-cols-2 grid-rows-2", tiles: ["", "", "", ""] };
		case 5:
			return {
				box: "aspect-[6/5] grid-cols-6 grid-rows-[3fr_2fr]",
				tiles: ["col-span-3", "col-span-3", "col-span-2", "col-span-2", "col-span-2"],
			};
		default:
			return null;
	}
}

/** Generated label, no alt text field (unconfirmed default): "Photo 2 of 5 in <title>". */
export const mediaLabel = (kind: BlobMediaKind, index: number, total: number, title: string) =>
	`${kind === BLOB_MEDIA_KIND.memoryVideo ? "Video" : "Photo"} ${index + 1} of ${total} in ${title}`;

/** Moves item `i` one step earlier (-1) or later (1); out of range is a no-op. */
export function moveItem<T>(items: readonly T[], i: number, by: -1 | 1): T[] {
	const j = i + by;
	if (i < 0 || i >= items.length || j < 0 || j >= items.length) return [...items];
	const next = [...items];
	[next[i], next[j]] = [next[j]!, next[i]!];
	return next;
}
