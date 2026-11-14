import { describe, expect, it } from "vitest";
import { APP1_EXIF, APP13_PHOTOSHOP, COM, jpeg, rangeReader } from "@/test/jpegFixture";
import { stripJpeg, verifyJpeg } from "./jpeg";

const verify = (bytes: Uint8Array, maxEdge = 2048) =>
	verifyJpeg(rangeReader(bytes).read, bytes.length, { maxEdge });

describe("fixture", () => {
	it("carries WebKit's 76-byte APP1 and 56-byte APP13 (length fields)", () => {
		expect((APP1_EXIF[2]! << 8) | APP1_EXIF[3]!).toBe(76);
		expect((APP13_PHOTOSHOP[2]! << 8) | APP13_PHOTOSHOP[3]!).toBe(56);
	});
});

describe("verifyJpeg", () => {
	it("rejects APP1", async () => {
		expect(await verify(jpeg({ extra: [APP1_EXIF] }))).toEqual({ ok: false, reason: "metadata" });
	});

	it("rejects APP13", async () => {
		expect(await verify(jpeg({ extra: [APP13_PHOTOSHOP] }))).toEqual({
			ok: false,
			reason: "metadata",
		});
	});

	it("rejects COM", async () => {
		expect(await verify(jpeg({ extra: [COM] }))).toEqual({ ok: false, reason: "metadata" });
	});

	it("rejects a file with no SOS", async () => {
		expect(await verify(jpeg({ extra: [], withSos: false }))).toEqual({
			ok: false,
			reason: "malformed",
		});
	});

	it("rejects a non-JPEG", async () => {
		const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
		expect(await verify(png)).toEqual({ ok: false, reason: "malformed" });
	});

	it("rejects a longest edge over the variant's limit", async () => {
		expect(await verify(jpeg({ extra: [], width: 130, height: 100 }), 128)).toEqual({
			ok: false,
			reason: "tooLarge",
		});
	});

	it("accepts a stripped WebKit-shaped file and reads its size", async () => {
		const stripped = new Uint8Array(await (await stripJpeg(new Blob([jpeg()]))).arrayBuffer());
		expect(await verify(stripped)).toEqual({ ok: true, width: 1024, height: 768 });
	});

	it("reads a bounded amount however big the scan data is", async () => {
		const big = jpeg({ extra: [], scanBytes: 5 * 1024 * 1024 });
		const r = rangeReader(big);
		expect((await verifyJpeg(r.read, big.length, { maxEdge: 2048 })).ok).toBe(true);
		expect(r.calls.length).toBe(1);
		expect(r.calls.reduce((n, [, len]) => n + len, 0)).toBeLessThanOrEqual(8192);
	});
});

describe("stripJpeg", () => {
	it("drops WebKit's APP1 + APP13 (136 bytes) and keeps APP0, tables and scan", async () => {
		const src = jpeg();
		const out = new Uint8Array(await (await stripJpeg(new Blob([src]))).arrayBuffer());
		expect(src.length - out.length).toBe(136);
		expect([...out.slice(0, 4)]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
		expect([...out.slice(-2)]).toEqual([0xff, 0xd9]);
		expect([...out]).toEqual([...jpeg({ extra: [] })]);
	});

	it("drops COM too", async () => {
		const out = await stripJpeg(new Blob([jpeg({ extra: [COM] })]));
		expect(new Uint8Array(await out.arrayBuffer())).toEqual(jpeg({ extra: [] }));
	});

	it("returns a JPEG-typed Blob", async () => {
		expect((await stripJpeg(new Blob([jpeg()]))).type).toBe("image/jpeg");
	});

	it("throws on a file with no SOS", async () => {
		await expect(stripJpeg(new Blob([jpeg({ withSos: false })]))).rejects.toThrow();
	});
});
