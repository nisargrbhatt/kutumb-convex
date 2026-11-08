import { BLOB_MEDIA_KIND } from "@/db/constants";
import { variantMaxEdge } from "./blob";
import { PICKED_PHOTO_MAX_BYTES } from "./limits";

/** Browser photo rules (spec: Upload > Photos in the browser). Pure and client-safe. */

/** Longest edge `createImageBitmap` decodes to; bakes EXIF orientation. */
export const DECODE_MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

/** `accept` for every photo picker: HEIC stays pickable so the rejection can explain itself. */
export const PHOTO_ACCEPT = "image/*,.heic,.heif";

export const PHOTO_COPY = {
	tooLarge: `This photo is over ${PICKED_PHOTO_MAX_BYTES / 1024 / 1024} MB. Pick a smaller one.`,
	heic: "This browser can't open HEIC photos. Export it as JPEG, or upload from an iPhone or Safari.",
	unreadable: "This photo couldn't be read. Try a different file.",
} as const;

/** Size check on the picked file, before any decode. */
export const checkPickedPhoto = (file: { size: number }) =>
	file.size > PICKED_PHOTO_MAX_BYTES ? PHOTO_COPY.tooLarge : null;

const HEIC_TYPES = new Set([
	"image/heic",
	"image/heif",
	"image/heic-sequence",
	"image/heif-sequence",
]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * HEIC by type, extension or ISO-BMFF `ftyp` major brand (`head`: the file's first bytes). Only
 * asked after a failed decode, to pick the message.
 */
export function isHeic(file: { name: string; type: string }, head: Uint8Array) {
	if (HEIC_TYPES.has(file.type.toLowerCase())) return true;
	if (/\.hei[cf]$/i.test(file.name)) return true;
	if (head.length < 12) return false;
	const text = (from: number) => String.fromCharCode(...head.subarray(from, from + 4));
	return text(4) === "ftyp" && HEIC_BRANDS.has(text(8));
}

/** Output edge of a Profile Photo variant for a crop `cropEdge` source px wide: capped, never up. */
export const outputEdge = (variant: "avatar" | "display", cropEdge: number) =>
	Math.max(
		1,
		Math.min(variantMaxEdge(BLOB_MEDIA_KIND.profilePhoto, variant) ?? 0, Math.round(cropEdge))
	);
