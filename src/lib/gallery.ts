import { BLOB_MEDIA_KIND, BLOB_VARIANT } from "@/db/constants";
import { blobUrl, variantMaxEdge } from "@/domain/blob";
import type { StartUploadInput } from "@/domain/blobStore";
import { isAppError } from "@/domain/errors";
import { LIMIT_COPY, LIMIT_ERROR_CODES } from "@/domain/limits";
import { PHOTO_COPY, checkPickedPhoto, isHeic } from "@/domain/photo";
import { VIDEO_COPY, isVideoFile } from "@/domain/video";
import { discardUploads, startUpload } from "@/server/blob";
import type { GalleryUpload } from "./galleryDraft";
import { PhotoError, exportJpeg, scaledCopy } from "./photo";
import { putParts, type PutPart } from "./uploadParts";
import { prepareVideo } from "./video";

/**
 * Browser pipeline for Memory gallery photos (spec: Upload > Photos in the browser): decode once
 * (bakes EXIF orientation), export `display` (≤2048 px) and `thumb` (≤640 px) as stripped JPEGs,
 * then start and `PUT` both with progress. Browser only.
 */

const NOT_PHOTO = new Set(["image/gif", "image/svg+xml"]);
const edge = (variant: typeof BLOB_VARIANT.thumb | typeof BLOB_VARIANT.display) =>
	variantMaxEdge(BLOB_MEDIA_KIND.memoryImage, variant) ?? 0;

/** Decode and export both variants. Messages are the spec's two, inline on the item. */
async function exportMemoryImage(file: File) {
	const tooLarge = checkPickedPhoto(file);
	if (tooLarge) throw new PhotoError(tooLarge);
	if (NOT_PHOTO.has(file.type.toLowerCase())) throw new PhotoError(PHOTO_COPY.unreadable);
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
	} catch {
		const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
		throw new PhotoError(isHeic(file, head) ? PHOTO_COPY.heic : PHOTO_COPY.unreadable);
	}
	try {
		const display = scaledCopy(bitmap, edge(BLOB_VARIANT.display));
		const thumb = scaledCopy(display, edge(BLOB_VARIANT.thumb));
		return { display: await exportJpeg(display), thumb: await exportJpeg(thumb) };
	} finally {
		bitmap.close();
	}
}

type PutCopy = { tooLarge: string; unreadable: string };
const PHOTO_PUT: PutCopy = {
	tooLarge: "This photo is too large. Try a smaller one.",
	unreadable: PHOTO_COPY.unreadable,
};
const VIDEO_PUT: PutCopy = { tooLarge: VIDEO_COPY.tooLarge, unreadable: VIDEO_COPY.malformed };

/** One `PUT` with upload progress (fetch has none). Rejects with a member-facing message. */
function putVariant(
	url: string,
	body: Blob,
	onProgress: (bytes: number) => void,
	signal: AbortSignal,
	copy: PutCopy = PHOTO_PUT
) {
	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const onAbort = () => xhr.abort();
		signal.addEventListener("abort", onAbort, { once: true });
		const done = (fn: () => void) => {
			signal.removeEventListener("abort", onAbort);
			fn();
		};
		xhr.upload.onprogress = (e) => onProgress(e.loaded);
		xhr.onload = () =>
			done(() => {
				if (xhr.status >= 200 && xhr.status < 300) return resolve();
				// A Cloudflare 413 at the edge shows the same size message.
				reject(new PhotoError(xhr.status === 413 ? copy.tooLarge : copy.unreadable));
			});
		xhr.onerror = () =>
			done(() => reject(new PhotoError("Upload failed. Check your connection and try again.")));
		xhr.onabort = () => done(() => reject(new DOMException("Upload cancelled", "AbortError")));
		xhr.open("PUT", url);
		xhr.send(body);
	});
}

const startMessage = (error: unknown) => {
	if (isAppError(error) && error.code === LIMIT_ERROR_CODES.pendingUpload) {
		return LIMIT_COPY.pendingUpload.description;
	}
	return error instanceof Error && error.message ? error.message : PHOTO_COPY.unreadable;
};

/**
 * Start, then `PUT` each part in order with overall progress. Returns the `pending` Blob id and the
 * variants sent (an optional part may be missing); on any other failure (abort included) the Blob
 * is discarded before rethrowing.
 */
async function startAndPut(
	organizationId: string,
	start: StartUploadInput,
	parts: PutPart[],
	copy: PutCopy,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
) {
	signal.throwIfAborted();
	let blobId: string;
	try {
		({ blobId } = await startUpload({ data: start }));
	} catch (error) {
		throw new PhotoError(startMessage(error));
	}
	try {
		const sent = await putParts(
			parts,
			(variant, body, onBytes) =>
				putVariant(blobUrl(organizationId, blobId, variant), body, onBytes, signal, copy),
			onProgress,
			signal
		);
		return { blobId, sent };
	} catch (error) {
		await discardGalleryUploads([blobId]);
		throw error;
	}
}

/** Gallery photo for the active org: a `pending` Blob id plus a local preview of `thumb`. */
export const uploadMemoryImage =
	(organizationId: string): GalleryUpload =>
	async (file, onProgress, signal) => {
		const variants = await exportMemoryImage(file);
		const { blobId } = await startAndPut(
			organizationId,
			{
				mediaKind: BLOB_MEDIA_KIND.memoryImage,
				size: variants.thumb.size + variants.display.size,
			},
			[
				{ variant: BLOB_VARIANT.thumb, body: variants.thumb },
				{ variant: BLOB_VARIANT.display, body: variants.display },
			],
			PHOTO_PUT,
			onProgress,
			signal
		);
		return {
			blobId,
			previewUrl: URL.createObjectURL(variants.thumb),
			mediaKind: BLOB_MEDIA_KIND.memoryImage,
		};
	};

/**
 * Gallery video for the active org: checked and stripped in the browser, `video` then the optional
 * `poster`. Preview is the poster, or none.
 */
export const uploadMemoryVideo =
	(organizationId: string): GalleryUpload =>
	async (file, onProgress, signal) => {
		const { video, poster, contentType } = await prepareVideo(file);
		const parts: PutPart[] = [{ variant: BLOB_VARIANT.video, body: video }];
		// Best effort: a failed `poster` PUT keeps the Blob, with no poster.
		if (poster) parts.push({ variant: BLOB_VARIANT.poster, body: poster, optional: true });
		const { blobId, sent } = await startAndPut(
			organizationId,
			{
				mediaKind: BLOB_MEDIA_KIND.memoryVideo,
				size: video.size + (poster?.size ?? 0),
				contentType,
			},
			parts,
			VIDEO_PUT,
			onProgress,
			signal
		);
		return {
			blobId,
			previewUrl: poster && sent.includes(BLOB_VARIANT.poster) ? URL.createObjectURL(poster) : null,
			mediaKind: BLOB_MEDIA_KIND.memoryVideo,
		};
	};

/** Photo or video by the picked file's type or extension. */
export const uploadGalleryMedia = (organizationId: string): GalleryUpload => {
	const image = uploadMemoryImage(organizationId);
	const video = uploadMemoryVideo(organizationId);
	return (file, onProgress, signal) =>
		(isVideoFile(file) ? video : image)(file, onProgress, signal);
};

/** Best effort: a missed discard falls to the 24h expiry. */
export const discardGalleryUploads = (blobIds: string[]) =>
	discardUploads({ data: { blobIds } }).catch(() => undefined);
