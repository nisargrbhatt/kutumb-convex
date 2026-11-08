import type { Area } from "react-easy-crop";
import { BLOB_MEDIA_KIND, BLOB_VARIANT } from "@/db/constants";
import { blobUrl } from "@/domain/blob";
import { stripJpeg } from "@/domain/jpeg";
import {
	DECODE_MAX_EDGE,
	JPEG_QUALITY,
	PHOTO_COPY,
	checkPickedPhoto,
	isHeic,
	outputEdge,
} from "@/domain/photo";
import { discardUploads, startUpload } from "@/server/blob";

/**
 * Browser photo pipeline (spec: Upload > Photos in the browser): decode, crop, export, strip,
 * upload. Browser only.
 */

/** A message for the member, shown inline. */
export class PhotoError extends Error {}

export type DecodedPhoto = {
	/** Upright, longest edge ≤ 2048 px: the source of every export. */
	full: HTMLCanvasElement;
	/** 512 px copy for live previews. */
	preview: HTMLCanvasElement;
	/** Object URL of `full` for the crop stage; revoke with `releasePhoto`. */
	url: string;
};

const canvas = (w: number, h: number) => {
	const c = document.createElement("canvas");
	c.width = Math.max(1, Math.round(w));
	c.height = Math.max(1, Math.round(h));
	return c;
};

export const scaledCopy = (
	src: CanvasImageSource & { width: number; height: number },
	maxEdge: number
) => {
	const scale = Math.min(1, maxEdge / Math.max(src.width, src.height));
	const out = canvas(src.width * scale, src.height * scale);
	const ctx = out.getContext("2d");
	if (!ctx) throw new PhotoError(PHOTO_COPY.unreadable);
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(src, 0, 0, out.width, out.height);
	return out;
};

const toBlob = (c: HTMLCanvasElement, quality: number) =>
	new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", quality));

/**
 * Size check, then `createImageBitmap` as the only decode test (bakes EXIF orientation), capped
 * at 2048 px. A failed decode says HEIC when the file looks like one.
 */
export async function decodePhoto(file: File): Promise<DecodedPhoto> {
	const tooLarge = checkPickedPhoto(file);
	if (tooLarge) throw new PhotoError(tooLarge);
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	} catch {
		const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
		throw new PhotoError(isHeic(file, head) ? PHOTO_COPY.heic : PHOTO_COPY.unreadable);
	}
	try {
		const full = scaledCopy(bitmap, DECODE_MAX_EDGE);
		const preview = scaledCopy(full, 512);
		const blob = await toBlob(full, 0.92);
		if (!blob) throw new PhotoError(PHOTO_COPY.unreadable);
		return { full, preview, url: URL.createObjectURL(blob) };
	} finally {
		bitmap.close();
	}
}

export const releasePhoto = (photo: DecodedPhoto | null) => {
	if (photo) URL.revokeObjectURL(photo.url);
};

/**
 * Square `edge` px render of `area` (pixels in the rotated source's bounding box, as
 * `react-easy-crop` reports them) of `img` turned `rotation` degrees.
 */
export function renderCrop(img: HTMLCanvasElement, area: Area, rotation: number, edge: number) {
	const t = (rotation * Math.PI) / 180;
	const bw = Math.abs(Math.cos(t) * img.width) + Math.abs(Math.sin(t) * img.height);
	const bh = Math.abs(Math.sin(t) * img.width) + Math.abs(Math.cos(t) * img.height);
	const rotated = canvas(bw, bh);
	const r = rotated.getContext("2d");
	const out = canvas(edge, edge);
	const o = out.getContext("2d");
	if (!r || !o) throw new PhotoError(PHOTO_COPY.unreadable);
	r.translate(rotated.width / 2, rotated.height / 2);
	r.rotate(t);
	r.drawImage(img, -img.width / 2, -img.height / 2);
	o.imageSmoothingQuality = "high";
	o.drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, edge, edge);
	return out;
}

/** Canvas → stripped JPEG. `toBlob` silently falls back to PNG, so the type is checked. */
export async function exportJpeg(c: HTMLCanvasElement) {
	const blob = await toBlob(c, JPEG_QUALITY);
	if (!blob || blob.type !== "image/jpeg") throw new PhotoError(PHOTO_COPY.unreadable);
	return stripJpeg(blob);
}

/** `avatar` (≤128 px) and `display` (≤1024 px), never upscaled past the crop. */
export async function exportProfilePhoto(photo: DecodedPhoto, area: Area, rotation: number) {
	const avatar = await exportJpeg(
		renderCrop(photo.full, area, rotation, outputEdge(BLOB_VARIANT.avatar, area.width))
	);
	const display = await exportJpeg(
		renderCrop(photo.full, area, rotation, outputEdge(BLOB_VARIANT.display, area.width))
	);
	return { avatar, display };
}

const sha256Hex = async (blob: Blob) =>
	[...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))]
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");

async function putVariant(url: string, body: Blob, headers: HeadersInit, signal?: AbortSignal) {
	const res = await fetch(url, { method: "PUT", body, headers, signal });
	if (!res.ok) {
		throw new PhotoError(
			res.status === 413 ? "This photo is too large. Try a smaller crop." : PHOTO_COPY.unreadable
		);
	}
}

/**
 * Start, then `PUT` both variants. Returns the `pending` Blob id; on any failure (abort included)
 * the Blob is discarded before rethrowing.
 */
export async function uploadProfilePhoto(
	organizationId: string,
	variants: { avatar: Blob; display: Blob },
	signal?: AbortSignal
) {
	const { blobId } = await startUpload({
		data: {
			mediaKind: BLOB_MEDIA_KIND.profilePhoto,
			size: variants.avatar.size + variants.display.size,
		},
	});
	try {
		await putVariant(
			blobUrl(organizationId, blobId, BLOB_VARIANT.avatar),
			variants.avatar,
			{},
			signal
		);
		await putVariant(
			blobUrl(organizationId, blobId, BLOB_VARIANT.display),
			variants.display,
			{ "x-blob-sha256": await sha256Hex(variants.display) },
			signal
		);
		return blobId;
	} catch (error) {
		await discardPhotoUpload(blobId);
		throw error;
	}
}

/** Best effort: a missed discard falls to the 24h expiry. */
export const discardPhotoUpload = (blobId: string) =>
	discardUploads({ data: { blobIds: [blobId] } }).catch(() => undefined);
