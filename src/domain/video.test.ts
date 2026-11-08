import { describe, expect, it } from "vitest";
import {
	materialize,
	metaLocation,
	movie,
	sparseReader,
	udtaLocation,
	type MovieOptions,
} from "@/test/mp4Fixture";
import { blobReadRange } from "./jpeg";
import { checkVideo, scanVideo, stripVideo, verifyVideo } from "./video";

const verify = (opts: MovieOptions = {}) => {
	const file = movie(opts);
	const r = sparseReader(file);
	return verifyVideo(r.read, file.size);
};

describe("verifyVideo", () => {
	it("H.264 .mp4: type, duration, size", async () => {
		expect(await verify({ brand: "isom", codec: "avc1", durationMs: 12_500 })).toEqual({
			ok: true,
			contentType: "video/mp4",
			codec: "avc1",
			durationMs: 12_500,
			width: 1920,
			height: 1080,
		});
	});

	it("HEVC .mov reads as video/quicktime", async () => {
		expect(await verify({ brand: "qt  ", codec: "hvc1" })).toMatchObject({
			ok: true,
			contentType: "video/quicktime",
			codec: "hvc1",
		});
		expect(await verify({ brand: "qt  ", codec: "hev1" })).toMatchObject({ ok: true });
	});

	it("portrait rotation swaps width and height", async () => {
		expect(await verify({ width: 1920, height: 1080, rotation: 90 })).toMatchObject({
			ok: true,
			width: 1080,
			height: 1920,
		});
		expect(await verify({ width: 1920, height: 1080, rotation: 180 })).toMatchObject({
			width: 1920,
			height: 1080,
		});
	});

	it("moov at the end of a large file, in a capped number of reads", async () => {
		const file = movie({ moovAtEnd: true, mdatSize: 90_000_000 });
		const r = sparseReader(file);
		expect(await verifyVideo(r.read, file.size)).toMatchObject({ ok: true, durationMs: 10_000 });
		expect(r.stats.reads).toBeLessThanOrEqual(12);
		expect(r.stats.bytes).toBeLessThan(1_000_000);
	});

	it("read count stays capped on a 319 MB file (scan only)", async () => {
		const file = movie({ moovAtEnd: true, mdatSize: 319_000_000 });
		const r = sparseReader(file);
		expect(await scanVideo(r.read, file.size)).toMatchObject({ ok: true });
		expect(r.stats.reads).toBeLessThanOrEqual(12);
	});

	it("rejects leftover location data: udta in moov or trak, meta at any level", async () => {
		const reason = { ok: false, reason: "metadata" };
		expect(await verify({ moovExtra: [udtaLocation()] })).toEqual(reason);
		expect(await verify({ trakExtra: [udtaLocation()] })).toEqual(reason);
		expect(await verify({ moovExtra: [metaLocation()] })).toEqual(reason);
		expect(await verify({ topExtra: [metaLocation()] })).toEqual(reason);
	});

	it("rejects 121 s; 120 s passes", async () => {
		expect(await verify({ durationMs: 121_000 })).toEqual({ ok: false, reason: "duration" });
		expect(await verify({ durationMs: 120_000 })).toMatchObject({ ok: true });
	});

	it("rejects over 95,000,000 bytes without reading", async () => {
		const file = movie({ mdatSize: 95_000_001 });
		const r = sparseReader(file);
		expect(await verifyVideo(r.read, file.size)).toEqual({ ok: false, reason: "tooLarge" });
		expect(r.stats.reads).toBe(0);
	});

	it("rejects other codecs, other brands, oversize edges, junk", async () => {
		expect(await verify({ codec: "vp09" })).toEqual({ ok: false, reason: "codec" });
		expect(await verify({ brand: "heic" })).toEqual({ ok: false, reason: "type" });
		expect(await verify({ width: 4097, height: 2160 })).toEqual({
			ok: false,
			reason: "dimensions",
		});
		const junk = new Uint8Array(4096).fill(7);
		expect(await verifyVideo(blobReadRange(new Blob([junk])), junk.length)).toEqual({
			ok: false,
			reason: "malformed",
		});
	});
});

describe("browser: checkVideo, stripVideo", () => {
	it("check ignores metadata (the strip handles it), strip renames it to free", async () => {
		const file = movie({ brand: "qt  ", moovExtra: [udtaLocation(), metaLocation()] });
		const source = new Blob([materialize(file)]);
		const scan = await scanVideo(blobReadRange(source), source.size);
		expect(checkVideo(scan, source.size)).toMatchObject({ ok: true });
		if (!scan.ok) throw new Error("scan failed");
		expect(scan.metadataAt).toHaveLength(2);
		expect(await verifyVideo(blobReadRange(source), source.size)).toEqual({
			ok: false,
			reason: "metadata",
		});
		const stripped = stripVideo(source, scan);
		expect(stripped.size).toBe(source.size);
		expect(stripped.type).toBe("video/quicktime");
		expect(await verifyVideo(blobReadRange(stripped), stripped.size)).toMatchObject({ ok: true });
	});
});
