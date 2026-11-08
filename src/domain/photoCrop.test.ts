import { describe, expect, it } from "vitest";
import { clampCrop, cropSide, minZoomForAngle } from "./photoCrop";

const deg = (d: number) => (d * Math.PI) / 180;

/** Crop square corners (crop centred in the stage) inside the rotated, zoomed, shifted photo? */
function cornersInside(
	media: { width: number; height: number },
	crop: { x: number; y: number },
	zoom: number,
	rotation: number
) {
	const s = cropSide(media);
	const t = deg(rotation);
	const eps = 1e-6;
	return [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1],
	].every(([sx, sy]) => {
		// Corner relative to the photo centre, then into the photo's own frame.
		const px = (sx! * s) / 2 - crop.x;
		const py = (sy! * s) / 2 - crop.y;
		const u = px * Math.cos(t) + py * Math.sin(t);
		const v = -px * Math.sin(t) + py * Math.cos(t);
		return (
			Math.abs(u) <= (media.width * zoom) / 2 + eps &&
			Math.abs(v) <= (media.height * zoom) / 2 + eps
		);
	});
}

describe("minZoomForAngle", () => {
	it("is 1 on square angles, rises with the straighten angle", () => {
		for (const a of [0, 90, 180, 270, -90]) expect(minZoomForAngle(a)).toBe(1);
		expect(minZoomForAngle(10)).toBeGreaterThan(1);
		expect(minZoomForAngle(45)).toBeGreaterThan(minZoomForAngle(10));
		expect(minZoomForAngle(45)).toBeCloseTo(Math.SQRT2, 2);
		expect(minZoomForAngle(-20)).toBeCloseTo(minZoomForAngle(20));
		expect(minZoomForAngle(90 + 20)).toBeCloseTo(minZoomForAngle(20));
	});

	it("at the minimum zoom a centred crop never leaves the photo (no wedges)", () => {
		const media = { width: 600, height: 400 };
		for (let a = -45; a <= 45; a += 5) {
			for (const q of [0, 90, 180, 270]) {
				expect(cornersInside(media, { x: 0, y: 0 }, minZoomForAngle(a + q), a + q)).toBe(true);
			}
		}
	});
});

describe("clampCrop", () => {
	const media = { width: 600, height: 400 };

	it("unrotated: same bounds as the library's own restriction", () => {
		// (W·z − s) / 2 horizontally, (H·z − s) / 2 vertically; s = 400.
		expect(clampCrop({ x: 999, y: -999 }, { media, zoom: 2, rotation: 0 })).toEqual({
			x: 400,
			y: -200,
		});
		expect(clampCrop({ x: 10, y: 5 }, { media, zoom: 2, rotation: 0 })).toEqual({ x: 10, y: 5 });
	});

	it("at the angle's minimum zoom only the centre fits", () => {
		const c = clampCrop({ x: 300, y: 300 }, { media, zoom: minZoomForAngle(30), rotation: 30 });
		expect(cornersInside(media, c, minZoomForAngle(30), 30)).toBe(true);
	});

	it("any drag at any allowed zoom keeps every crop corner on the photo", () => {
		let seed = 7;
		const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
		for (let i = 0; i < 500; i++) {
			const rotation = Math.round(rnd() * 45) + [0, 90, 180, 270][i % 4]!;
			const zoom = minZoomForAngle(rotation) + Math.abs(rnd()) * 3;
			const wanted = { x: rnd() * 2000, y: rnd() * 2000 };
			const m = i % 2 ? media : { width: 300, height: 500 };
			expect(
				cornersInside(m, clampCrop(wanted, { media: m, zoom, rotation }), zoom, rotation)
			).toBe(true);
		}
	});

	it("zoom below the minimum is treated as the minimum", () => {
		const c = clampCrop({ x: 50, y: 50 }, { media, zoom: 1, rotation: 30 });
		expect(cornersInside(media, c, minZoomForAngle(30), 30)).toBe(true);
	});
});
