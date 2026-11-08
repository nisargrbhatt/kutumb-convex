import { BLOB_MEDIA_KIND } from "@/db/constants";
import { blobUrl, variantMaxEdge } from "@/domain/blob";
import { isAppError } from "@/domain/errors";
import { LIMIT_COPY, LIMIT_ERROR_CODES } from "@/domain/limits";
import { PHOTO_COPY, checkPickedPhoto, isHeic } from "@/domain/photo";
import { discardUploads, startUpload } from "@/server/blob";
import type { GalleryUpload } from "./galleryDraft";
import { PhotoError, exportJpeg, scaledCopy } from "./photo";

/**
 * Browser pipeline for Memory gallery photos (spec: Upload > Photos in the browser): decode once
 * (bakes EXIF orientation), export `display` (≤2048 px) and `thumb` (≤640 px) as stripped JPEGs,
 * then start and `PUT` both with progress. Browser only.
 */

const NOT_PHOTO = new Set(["image/gif", "image/svg+xml"]);
const edge = (variant: "thumb" | "display") =>
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
		const display = scaledCopy(bitmap, edge("display"));
		const thumb = scaledCopy(display, edge("thumb"));
		return { display: await exportJpeg(display), thumb: await exportJpeg(thumb) };
	} finally {
		bitmap.close();
	}
}

/** One `PUT` with upload progress (fetch has none). Rejects with a member-facing message. */
function putVariant(
	url: string,
	body: Blob,
	onProgress: (bytes: number) => void,
	signal: AbortSignal
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
				reject(
					new PhotoError(
						xhr.status === 413
							? "This photo is too large. Try a smaller one."
							: PHOTO_COPY.unreadable
					)
				);
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

/** Gallery upload for the active org: a `pending` Blob id plus a local preview of `thumb`. */
export const uploadMemoryImage =
	(organizationId: string): GalleryUpload =>
	async (file, onProgress, signal) => {
		const variants = await exportMemoryImage(file);
		signal.throwIfAborted();
		const total = variants.thumb.size + variants.display.size;
		let blobId: string;
		try {
			({ blobId } = await startUpload({
				data: { mediaKind: BLOB_MEDIA_KIND.memoryImage, size: total },
			}));
		} catch (error) {
			throw new PhotoError(startMessage(error));
		}
		try {
			signal.throwIfAborted();
			onProgress(0.02);
			let sent = 0;
			for (const variant of ["thumb", "display"] as const) {
				const body = variants[variant];
				await putVariant(
					blobUrl(organizationId, blobId, variant),
					body,
					(bytes) => onProgress(0.02 + (0.98 * (sent + bytes)) / total),
					signal
				);
				sent += body.size;
			}
			onProgress(1);
			return { blobId, previewUrl: URL.createObjectURL(variants.thumb) };
		} catch (error) {
			await discardGalleryUploads([blobId]);
			throw error;
		}
	};

/** Best effort: a missed discard falls to the 24h expiry. */
export const discardGalleryUploads = (blobIds: string[]) =>
	discardUploads({ data: { blobIds } }).catch(() => undefined);
