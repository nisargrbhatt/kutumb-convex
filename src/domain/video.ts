import { BLOB_VIDEO_CONTENT_TYPE } from "@/db/constants";
import type { ReadRange } from "./jpeg";
import { VIDEO_CODECS, VIDEO_MAX_BYTES, VIDEO_MAX_DURATION_MS, VIDEO_MAX_EDGE } from "./limits";

/**
 * ISO-BMFF atom walk, shared by the browser's check and strip and the Worker's verify (spec: Upload
 * > Video in the browser, Worker verification). Pure and client-safe. Reads through `readRange`
 * within a capped number of reads, so cost is flat in file size: box headers, `mvhd`, `tkhd`,
 * `hdlr` and `stsd` only.
 */

export type VideoContentType =
	(typeof BLOB_VIDEO_CONTENT_TYPE)[keyof typeof BLOB_VIDEO_CONTENT_TYPE];

/** Bytes fetched per read: a short clip's whole `moov` fits in one. */
const CHUNK = 64 * 1024;
/** Cap on reads per walk; a file needing more is rejected as malformed. */
const MAX_READS = 12;
/** Cap on boxes visited. */
const MAX_BOXES = 512;

/** `ftyp` major brands; anything else (HEIC, 3GP, ...) is not a video we take. */
const BRANDS: Record<string, VideoContentType> = {
	"qt  ": BLOB_VIDEO_CONTENT_TYPE.quicktime,
	isom: BLOB_VIDEO_CONTENT_TYPE.mp4,
	iso2: BLOB_VIDEO_CONTENT_TYPE.mp4,
	iso4: BLOB_VIDEO_CONTENT_TYPE.mp4,
	iso5: BLOB_VIDEO_CONTENT_TYPE.mp4,
	iso6: BLOB_VIDEO_CONTENT_TYPE.mp4,
	mp41: BLOB_VIDEO_CONTENT_TYPE.mp4,
	mp42: BLOB_VIDEO_CONTENT_TYPE.mp4,
	avc1: BLOB_VIDEO_CONTENT_TYPE.mp4,
	"M4V ": BLOB_VIDEO_CONTENT_TYPE.mp4,
	MSNV: BLOB_VIDEO_CONTENT_TYPE.mp4,
};

/** Boxes that carry location and other capture metadata: the browser renames them to `free`. */
const METADATA = new Set(["udta", "meta"]);

class Malformed extends Error {}

const text = (b: Uint8Array, at: number) =>
	String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** Chunked reader; throws `Malformed` past `size` or over the read cap. */
function chunkedReader(readRange: ReadRange, size: number) {
	let start = 0;
	let buf: Uint8Array = new Uint8Array(0);
	let reads = 0;
	return async (offset: number, length: number): Promise<Uint8Array> => {
		if (offset < 0 || offset + length > size) throw new Malformed();
		if (offset < start || offset + length > start + buf.length) {
			if (++reads > MAX_READS) throw new Malformed();
			start = offset;
			buf = await readRange(offset, Math.min(Math.max(CHUNK, length), size - offset));
			if (buf.length < length) throw new Malformed();
		}
		return buf.subarray(offset - start, offset - start + length);
	};
}

type Box = { type: string; offset: number; header: number; end: number };

type Track = {
	handler?: string;
	codec?: string;
	width?: number;
	height?: number;
};

export type VideoScan =
	| {
			ok: true;
			contentType: VideoContentType;
			codec: string;
			durationMs: number;
			/** Display size: `tkhd` with rotation applied. */
			width: number;
			height: number;
			/** Offsets of `udta` / `meta` boxes still in the file. */
			metadataAt: number[];
	  }
	| { ok: false; reason: "malformed" | "type" };

/** Walks the atoms. Structural reads only; policy is `checkVideo` / `verifyVideo`. */
export async function scanVideo(readRange: ReadRange, size: number): Promise<VideoScan> {
	try {
		return await walk(chunkedReader(readRange, size), size);
	} catch (error) {
		if (error instanceof Malformed) return { ok: false, reason: "malformed" };
		throw error;
	}
}

async function walk(
	read: (offset: number, length: number) => Promise<Uint8Array>,
	size: number
): Promise<VideoScan> {
	let visited = 0;
	const metadataAt: number[] = [];

	/** Children of `[from, to)`; stops early when `visit` returns true. */
	async function children(from: number, to: number, visit: (b: Box) => Promise<boolean | void>) {
		let pos = from;
		while (pos + 8 <= to) {
			if (++visited > MAX_BOXES) throw new Malformed();
			const head = await read(pos, 8);
			let boxSize = view(head).getUint32(0);
			const type = text(head, 4);
			let header = 8;
			if (boxSize === 1) {
				const large = await read(pos + 8, 8);
				boxSize = Number(view(large).getBigUint64(0));
				header = 16;
			} else if (boxSize === 0) {
				boxSize = to - pos;
			}
			if (boxSize < header || pos + boxSize > to) throw new Malformed();
			const b = { type, offset: pos, header, end: pos + boxSize };
			if (METADATA.has(type)) metadataAt.push(pos);
			else if (await visit(b)) return;
			pos = b.end;
		}
		if (pos !== to && to - pos >= 8) throw new Malformed();
	}

	const first = await read(0, 12);
	if (text(first, 4) !== "ftyp") throw new Malformed();
	const contentType = BRANDS[text(first, 8)];
	if (!contentType) return { ok: false, reason: "type" };

	let durationMs: number | null = null;
	const tracks: Track[] = [];

	await children(0, size, async (top) => {
		if (top.type !== "moov") return;
		await children(top.offset + top.header, top.end, async (b) => {
			if (b.type === "mvhd") durationMs = await readMvhd(read, b);
			if (b.type === "trak") tracks.push(await readTrak(b));
		});
	});

	async function readTrak(trak: Box) {
		const track: Track = {};
		await children(trak.offset + trak.header, trak.end, async (b) => {
			if (b.type === "tkhd") Object.assign(track, await readTkhd(read, b));
			if (b.type !== "mdia") return;
			await children(b.offset + b.header, b.end, async (m) => {
				if (m.type === "hdlr") {
					const h = await read(m.offset + m.header, 12);
					track.handler = text(h, 8);
				}
				if (m.type !== "minf") return;
				await children(m.offset + m.header, m.end, async (i) => {
					if (i.type !== "stbl") return;
					await children(i.offset + i.header, i.end, async (s) => {
						if (s.type !== "stsd") return;
						const d = await read(s.offset + s.header, 16);
						if (view(d).getUint32(4) < 1) throw new Malformed();
						track.codec = text(d, 12);
						return true;
					});
					return true;
				});
				return track.handler !== undefined;
			});
		});
		return track;
	}

	const video = tracks.find((t) => t.handler === "vide");
	if (durationMs === null || !video?.codec || video.width === undefined) throw new Malformed();
	return {
		ok: true,
		contentType,
		codec: video.codec,
		durationMs,
		width: video.width,
		height: video.height!,
		metadataAt,
	};
}

async function readMvhd(read: (o: number, l: number) => Promise<Uint8Array>, b: Box) {
	if (b.end - b.offset - b.header < 32) throw new Malformed();
	const v = await read(b.offset + b.header, 32);
	const version = v[0];
	const d = view(v);
	const [timescale, duration] =
		version === 1
			? [d.getUint32(20), Number(d.getBigUint64(24))]
			: [d.getUint32(12), d.getUint32(16)];
	if (timescale === 0) throw new Malformed();
	return Math.round((duration * 1000) / timescale);
}

async function readTkhd(read: (o: number, l: number) => Promise<Uint8Array>, b: Box) {
	const start = b.offset + b.header;
	const version = (await read(start, 1))[0];
	const at = version === 1 ? 52 : 40;
	if (b.end - start < at + 44) throw new Malformed();
	const v = await read(start, at + 44);
	const d = view(v);
	const a = d.getInt32(at);
	const bb = d.getInt32(at + 4);
	const w = d.getUint32(at + 36) >>> 16;
	const h = d.getUint32(at + 40) >>> 16;
	// A quarter turn (a = d = 0) swaps the display size.
	const turned = a === 0 && bb !== 0;
	return turned ? { width: h, height: w } : { width: w, height: h };
}

export type VideoVerdict =
	| {
			ok: true;
			contentType: VideoContentType;
			codec: string;
			durationMs: number;
			width: number;
			height: number;
	  }
	| {
			ok: false;
			reason: "tooLarge" | "malformed" | "type" | "codec" | "duration" | "dimensions" | "metadata";
	  };

/** Policy on a scan, metadata aside: size, codec, duration, edges. The browser's inline check. */
export function checkVideo(scan: VideoScan, size: number): VideoVerdict {
	if (size > VIDEO_MAX_BYTES) return { ok: false, reason: "tooLarge" };
	if (!scan.ok) return scan;
	if (!(VIDEO_CODECS as readonly string[]).includes(scan.codec)) {
		return { ok: false, reason: "codec" };
	}
	if (scan.durationMs > VIDEO_MAX_DURATION_MS) return { ok: false, reason: "duration" };
	if (scan.width === 0 || scan.height === 0 || Math.max(scan.width, scan.height) > VIDEO_MAX_EDGE) {
		return { ok: false, reason: "dimensions" };
	}
	const { metadataAt: _m, ok: _ok, ...info } = scan;
	return { ok: true, ...info };
}

/** Worker verify: size first (no reads), then the walk, the policy, and no leftover metadata. */
export async function verifyVideo(readRange: ReadRange, size: number): Promise<VideoVerdict> {
	if (size > VIDEO_MAX_BYTES) return { ok: false, reason: "tooLarge" };
	const scan = await scanVideo(readRange, size);
	const verdict = checkVideo(scan, size);
	if (verdict.ok && scan.ok && scan.metadataAt.length > 0) {
		return { ok: false, reason: "metadata" };
	}
	return verdict;
}

const FREE = new TextEncoder().encode("free");

/**
 * Browser strip: renames every `udta` and `meta` the scan found to `free`, in a new `Blob` built
 * from slices of `file` (no remux, no byte copy). Same size, same offsets.
 */
export function stripVideo(file: Blob, scan: Extract<VideoScan, { ok: true }>): Blob {
	const parts: BlobPart[] = [];
	let pos = 0;
	for (const at of [...scan.metadataAt].sort((x, y) => x - y)) {
		parts.push(file.slice(pos, at + 4), FREE);
		pos = at + 8;
	}
	parts.push(file.slice(pos));
	return new Blob(parts, { type: scan.contentType });
}

/** `accept` addition for gallery pickers (spec: Feed UI > Drawer). */
export const VIDEO_ACCEPT = ".mov,.mp4,video/mp4,video/quicktime";

/** Picked file goes down the video path: by type or extension, never by sniffing. */
export const isVideoFile = (file: { name: string; type: string }) =>
	file.type.toLowerCase().startsWith("video/") || /\.(mov|mp4)$/i.test(file.name);

/** Member-facing rejection copy, inline on the gallery item. Size leads (spec: Upload > Limits). */
export const VIDEO_COPY: Record<Exclude<VideoVerdict, { ok: true }>["reason"], string> = {
	tooLarge: `This video is over ${VIDEO_MAX_BYTES / 1_000_000} MB. Trim it or pick a shorter one.`,
	duration: `This video is over ${VIDEO_MAX_DURATION_MS / 1000} seconds. Trim it or pick a shorter one.`,
	type: "Only .mov and .mp4 videos can be added.",
	codec: "This video's format isn't supported. Use an H.264 or HEVC video.",
	dimensions: `This video is larger than ${VIDEO_MAX_EDGE} px. Export it at a smaller size.`,
	metadata: "This video couldn't be read. Try a different file.",
	malformed: "This video couldn't be read. Try a different file.",
};
