/**
 * JPEG marker walk, shared by the Worker's verify and the browser's strip (spec: Upload > Worker
 * verification, Photos in the browser). Pure and client-safe. Reads through `readRange`, so cost is
 * flat in file size: only segment headers up to SOS are touched.
 */

export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;

/** Bytes fetched per read. A canvas JPEG's header (APP0, tables, SOF, SOS) fits in one. */
const CHUNK = 4096;
/** Cap on reads per walk; a header needing more is rejected as malformed. */
const MAX_READS = 8;
/** Cap on segments before SOS. */
const MAX_SEGMENTS = 64;

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const COM = 0xfe;

const isApp = (m: number) => m >= 0xe0 && m <= 0xef;
/** SOF0-15 except DHT (C4), JPG (C8), DAC (CC). */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** Metadata the strip drops and the verify rejects: every APPn but APP0, and COM. */
const isMetadata = (m: number) => (isApp(m) && m !== APP0) || m === COM;

type Segment = { marker: number; offset: number; length: number };
type Scan =
	| { ok: true; segments: Segment[]; sosOffset: number; width: number; height: number }
	| { ok: false; reason: "malformed" };

const MALFORMED = { ok: false, reason: "malformed" } as const;

/** Chunked reader over `readRange`; returns null past `size` or over the read cap. */
function chunkedReader(readRange: ReadRange, size: number) {
	let start = 0;
	let buf: Uint8Array = new Uint8Array(0);
	let reads = 0;
	return async (offset: number, length: number): Promise<Uint8Array | null> => {
		if (offset + length > size) return null;
		if (offset < start || offset + length > start + buf.length) {
			if (++reads > MAX_READS) return null;
			start = offset;
			buf = await readRange(offset, Math.min(Math.max(CHUNK, length), size - offset));
			if (buf.length < length) return null;
		}
		return buf.subarray(offset - start, offset - start + length);
	};
}

/** Walks markers from SOI to SOS. Structural checks only; policy is the caller's. */
async function scanJpeg(readRange: ReadRange, size: number): Promise<Scan> {
	const read = chunkedReader(readRange, size);
	const soi = await read(0, 2);
	if (!soi || soi[0] !== 0xff || soi[1] !== SOI) return MALFORMED;

	const segments: Segment[] = [];
	let dims: { width: number; height: number } | null = null;
	let pos = 2;
	while (segments.length < MAX_SEGMENTS) {
		const head = await read(pos, 4);
		if (!head || head[0] !== 0xff) return MALFORMED;
		const marker = head[1]!;
		// Fill bytes, standalone markers or EOI before SOS: not a canvas JPEG.
		if (marker === 0xff || marker === EOI || marker === SOI || marker === 0x01) return MALFORMED;
		if (marker >= 0xd0 && marker <= 0xd7) return MALFORMED;
		const len = (head[2]! << 8) | head[3]!;
		if (len < 2) return MALFORMED;
		if (marker === SOS) {
			if (!dims) return MALFORMED;
			return { ok: true, segments, sosOffset: pos, ...dims };
		}
		if (isSof(marker)) {
			const sof = await read(pos + 4, 5);
			if (!sof || len < 7) return MALFORMED;
			dims = { height: (sof[1]! << 8) | sof[2]!, width: (sof[3]! << 8) | sof[4]! };
			if (dims.width === 0 || dims.height === 0) return MALFORMED;
		}
		segments.push({ marker, offset: pos, length: len + 2 });
		pos += len + 2;
	}
	return MALFORMED;
}

export type JpegVerdict =
	| { ok: true; width: number; height: number }
	| { ok: false; reason: "malformed" | "metadata" | "tooLarge" };

/**
 * Worker verify: starts `FFD8`, walks to SOS, rejects any APPn but APP0 and any COM, longest edge
 * within `maxEdge`. A missing SOS within the capped reads is malformed.
 */
export async function verifyJpeg(
	readRange: ReadRange,
	size: number,
	{ maxEdge }: { maxEdge: number }
): Promise<JpegVerdict> {
	const scan = await scanJpeg(readRange, size);
	if (!scan.ok) return scan;
	if (scan.segments.some((s) => isMetadata(s.marker))) return { ok: false, reason: "metadata" };
	if (Math.max(scan.width, scan.height) > maxEdge) return { ok: false, reason: "tooLarge" };
	return { ok: true, width: scan.width, height: scan.height };
}

/** `readRange` over a `Blob` / `File`, by slices. */
export const blobReadRange =
	(blob: Blob): ReadRange =>
	async (offset, length) =>
		new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());

/**
 * Browser strip: drops every APPn but APP0, and COM, before SOS, into a new `Blob` built from
 * slices (no byte copy). Needed because WebKit's canvas JPEGs carry APP1 Exif and APP13 blocks.
 * Throws on a file the walk can't read.
 */
export async function stripJpeg(jpeg: Blob): Promise<Blob> {
	const scan = await scanJpeg(blobReadRange(jpeg), jpeg.size);
	if (!scan.ok) throw new Error("Not a readable JPEG");
	const parts: Blob[] = [jpeg.slice(0, 2)];
	for (const s of scan.segments) {
		if (!isMetadata(s.marker)) parts.push(jpeg.slice(s.offset, s.offset + s.length));
	}
	parts.push(jpeg.slice(scan.sosOffset));
	return new Blob(parts, { type: "image/jpeg" });
}
