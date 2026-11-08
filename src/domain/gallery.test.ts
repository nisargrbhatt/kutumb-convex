import { describe, expect, it } from "vitest";
import {
	formatDuration,
	mediaLabel,
	mosaicLayout,
	moveItem,
	parseGallery,
	singleRatio,
	videoDownloadName,
} from "./gallery";

describe("gallery rules", () => {
	it("reads the JSON gallery column in position order; junk reads as empty", () => {
		const col = JSON.stringify([
			{ blobId: "b", mediaKind: "memoryImage", width: 1, height: 2, durationMs: null, position: 1 },
			{ blobId: "a", mediaKind: "memoryImage", width: 3, height: 4, durationMs: null, position: 0 },
		]);
		expect(parseGallery(col).map((m) => m.blobId)).toEqual(["a", "b"]);
		expect(parseGallery(col)[0]).toEqual({
			blobId: "a",
			mediaKind: "memoryImage",
			width: 3,
			height: 4,
			durationMs: null,
			contentType: null,
			hasPoster: false,
		});
		expect(parseGallery("[]")).toEqual([]);
		expect(parseGallery("nope")).toEqual([]);
		expect(parseGallery(null)).toEqual([]);
	});

	it("video badge reads m:ss; download is named <title>-<n>.<ext>", () => {
		expect(formatDuration(0)).toBe("0:00");
		expect(formatDuration(61_900)).toBe("1:01");
		expect(formatDuration(120_000)).toBe("2:00");
		expect(videoDownloadName("Diwali", 1, "video/quicktime")).toBe("Diwali-2.mov");
		expect(videoDownloadName("Trip", 0, "video/mp4")).toBe("Trip-1.mp4");
		expect(videoDownloadName("a/b", 0, null)).toBe("a b-1.mov");
	});

	it("a single item keeps its shape between 4:5 and 1.9:1", () => {
		expect(singleRatio({ width: 1600, height: 1200 })).toBeCloseTo(4 / 3);
		expect(singleRatio({ width: 1000, height: 4000 })).toBe(0.8);
		expect(singleRatio({ width: 4000, height: 1000 })).toBe(1.9);
		expect(singleRatio({ width: null, height: null })).toBeCloseTo(4 / 3);
	});

	it("mosaic has a layout for 2 to 5, one tile class per item", () => {
		expect(mosaicLayout(1)).toBeNull();
		for (const n of [2, 3, 4, 5]) expect(mosaicLayout(n)?.tiles).toHaveLength(n);
		expect(mosaicLayout(3)?.tiles[0]).toBe("row-span-2");
		expect(mosaicLayout(5)?.tiles).toEqual([
			"col-span-3",
			"col-span-3",
			"col-span-2",
			"col-span-2",
			"col-span-2",
		]);
	});

	it("generated labels", () => {
		expect(mediaLabel("memoryImage", 1, 5, "Diwali")).toBe("Photo 2 of 5 in Diwali");
		expect(mediaLabel("memoryVideo", 0, 1, "Diwali")).toBe("Video 1 of 1 in Diwali");
	});

	it("reorder moves one step; the ends stay put", () => {
		expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
		expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
		expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
		expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
	});
});
