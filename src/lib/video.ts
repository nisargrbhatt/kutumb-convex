import { BLOB_MEDIA_KIND } from "@/db/constants";
import { variantMaxEdge } from "@/domain/blob";
import { blobReadRange } from "@/domain/jpeg";
import {
	VIDEO_COPY,
	checkVideo,
	scanVideo,
	stripVideo,
	type VideoContentType,
} from "@/domain/video";
import { PhotoError, exportJpeg } from "./photo";

/**
 * Browser video pipeline (spec: Upload > Video in the browser): size check and atom walk on `File`
 * slices with the Worker's own module, metadata renamed to `free`, optional poster. Browser only.
 */

/** A frame draw that hangs (codec the browser can't decode) gives up after this. */
const POSTER_TIMEOUT_MS = 8000;

const POSTER_EDGE = variantMaxEdge(BLOB_MEDIA_KIND.memoryVideo, "poster") ?? 1280;

/** Checks and strips; rejects with the inline message for the first rule broken. */
export async function prepareVideo(
	file: File
): Promise<{ video: Blob; poster: Blob | null; contentType: VideoContentType }> {
	const scan = await scanVideo(blobReadRange(file), file.size);
	const verdict = checkVideo(scan, file.size);
	if (!verdict.ok || !scan.ok) {
		throw new PhotoError(VIDEO_COPY[verdict.ok ? "malformed" : verdict.reason]);
	}
	const video = stripVideo(file, scan);
	const poster = await drawPoster(video).catch(() => null);
	return { video, poster, contentType: scan.contentType };
}

/**
 * One early frame to canvas, then the JPEG export and strip every photo gets. Null when this
 * browser can't decode the clip: the poster is optional.
 */
function drawPoster(video: Blob): Promise<Blob | null> {
	const url = URL.createObjectURL(video);
	const el = document.createElement("video");
	el.muted = true;
	el.playsInline = true;
	el.preload = "auto";
	return new Promise<Blob | null>((resolve) => {
		const timer = setTimeout(() => resolve(null), POSTER_TIMEOUT_MS);
		const finish = (blob: Blob | null) => {
			clearTimeout(timer);
			resolve(blob);
		};
		el.onerror = () => finish(null);
		el.onloadedmetadata = () => {
			if (el.videoWidth === 0) return finish(null);
			el.currentTime = Math.min(0.5, (el.duration || 0) / 2);
		};
		el.onseeked = () => {
			const scale = Math.min(1, POSTER_EDGE / Math.max(el.videoWidth, el.videoHeight));
			const canvas = document.createElement("canvas");
			canvas.width = Math.max(1, Math.round(el.videoWidth * scale));
			canvas.height = Math.max(1, Math.round(el.videoHeight * scale));
			const ctx = canvas.getContext("2d");
			if (!ctx) return finish(null);
			ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
			exportJpeg(canvas).then(finish, () => finish(null));
		};
		el.src = url;
	}).finally(() => {
		el.removeAttribute("src");
		el.load();
		URL.revokeObjectURL(url);
	});
}
