/**
 * Crop editor geometry (spec: Profile Photo > Crop editor). Pure and client-safe.
 *
 * Coordinates follow `react-easy-crop`: `media` is the photo's on-stage size at zoom 1 (contain
 * fit), `crop` is the photo's offset from the stage centre, and the square crop sits centred with
 * side `cropSide(media)`, fixed whatever the angle. The library's own restriction bounds the
 * rotated photo's bounding box, which shows white wedges once straightened; these bound the photo.
 */

type Size = { width: number; height: number };
type Point = { x: number; y: number };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Square crop side: the photo's short edge at zoom 1, so zoom 1 unrotated fills it exactly. */
export const cropSide = (media: Size) => Math.min(media.width, media.height);

/** `|cos| + |sin|`, with float noise on square angles snapped away. */
const spread = (deg: number) => {
	const t = rad(deg);
	const c = Math.abs(Math.cos(t));
	const s = Math.abs(Math.sin(t));
	return Math.abs(c * s) < 1e-9 ? 1 : c + s;
};

/**
 * Smallest zoom keeping the square crop inside the photo at `rotation` degrees: 1 on square
 * angles, rising to √2 at 45°. Off square angles a hair is added so pixel rounding in the export
 * can't expose a sliver.
 */
export const minZoomForAngle = (rotation: number) => {
	const s = spread(rotation);
	return s === 1 ? 1 : s * 1.002;
};

/**
 * Nearest allowed `crop` offset: every crop corner on the rotated, zoomed photo. A `zoom` under
 * the angle's minimum is treated as the minimum.
 */
export function clampCrop(
	crop: Point,
	{ media, zoom, rotation }: { media: Size; zoom: number; rotation: number }
): Point {
	const z = Math.max(zoom, minZoomForAngle(rotation));
	const t = rad(rotation);
	const cos = Math.cos(t);
	const sin = Math.sin(t);
	// Half the square's extent along either photo axis.
	const k = (cropSide(media) / 2) * spread(rotation);
	const a = Math.max(0, (media.width * z) / 2 - k);
	const b = Math.max(0, (media.height * z) / 2 - k);
	// Into the photo's frame, clamp, back out.
	const u = Math.min(a, Math.max(-a, crop.x * cos + crop.y * sin));
	const v = Math.min(b, Math.max(-b, -crop.x * sin + crop.y * cos));
	const x = u * cos - v * sin;
	const y = u * sin + v * cos;
	// Keep exact zeros and integers stable for React state comparisons.
	const tidy = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) + 0 : n);
	return { x: tidy(x), y: tidy(y) };
}
