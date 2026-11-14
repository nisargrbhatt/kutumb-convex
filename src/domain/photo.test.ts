import { describe, expect, it } from "vitest";
import { PICKED_PHOTO_MAX_BYTES } from "./limits";
import { PHOTO_COPY, checkPickedPhoto, isHeic, outputEdge, treeShowsPhotos } from "./photo";

const ftyp = (brand: string) =>
	new Uint8Array([
		0,
		0,
		0,
		24,
		...[..."ftyp"].map((c) => c.charCodeAt(0)),
		...[...brand].map((c) => c.charCodeAt(0)),
	]);

describe("isHeic", () => {
	it("by type, extension or ftyp brand", () => {
		const none = new Uint8Array();
		expect(isHeic({ name: "a.jpg", type: "image/heic" }, none)).toBe(true);
		expect(isHeic({ name: "a.jpg", type: "image/heif" }, none)).toBe(true);
		expect(isHeic({ name: "IMG_1.HEIC", type: "" }, none)).toBe(true);
		expect(isHeic({ name: "x.heif", type: "" }, none)).toBe(true);
		expect(isHeic({ name: "x", type: "" }, ftyp("heic"))).toBe(true);
		expect(isHeic({ name: "x", type: "" }, ftyp("mif1"))).toBe(true);
	});

	it("not for other files", () => {
		expect(isHeic({ name: "a.jpg", type: "image/jpeg" }, new Uint8Array([0xff, 0xd8]))).toBe(false);
		expect(isHeic({ name: "v.mp4", type: "" }, ftyp("isom"))).toBe(false);
		expect(isHeic({ name: "a.avif", type: "image/avif" }, ftyp("avif"))).toBe(false);
	});
});

describe("checkPickedPhoto", () => {
	it("refuses over 50 MiB before any decode", () => {
		expect(checkPickedPhoto({ size: PICKED_PHOTO_MAX_BYTES + 1 })).toBe(PHOTO_COPY.tooLarge);
		expect(checkPickedPhoto({ size: PICKED_PHOTO_MAX_BYTES })).toBeNull();
	});

	it("copy matches the spec", () => {
		expect(PHOTO_COPY.heic).toBe(
			"This browser can't open HEIC photos. Export it as JPEG, or upload from an iPhone or Safari."
		);
		expect(PHOTO_COPY.unreadable).toBe("This photo couldn't be read. Try a different file.");
		expect(PHOTO_COPY.tooLarge).toMatch(/50 MB/);
	});
});

describe("outputEdge", () => {
	it("caps at the variant's edge and never upscales", () => {
		expect(outputEdge("display", 1800)).toBe(1024);
		expect(outputEdge("display", 700.4)).toBe(700);
		expect(outputEdge("avatar", 1800)).toBe(128);
		expect(outputEdge("avatar", 90)).toBe(90);
		expect(outputEdge("display", 0.2)).toBe(1);
	});
});

describe("treeShowsPhotos", () => {
	it("photos at zoom 0.5 and above, initials below", () => {
		expect(treeShowsPhotos(0.2)).toBe(false);
		expect(treeShowsPhotos(0.49)).toBe(false);
		expect(treeShowsPhotos(0.5)).toBe(true);
		expect(treeShowsPhotos(2)).toBe(true);
	});
});
