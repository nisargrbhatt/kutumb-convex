/**
 * Tiny ISO-BMFF (`.mp4` / `.mov`) builders for the atom walker tests. Only boxes the walker reads
 * carry real fields; `mdat` is a header over a sparse gap, so a 300 MB file costs no memory.
 */

const enc = new TextEncoder();

const u32 = (n: number) => {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setUint32(0, n >>> 0);
	return b;
};
const u64 = (n: number) => {
	const b = new Uint8Array(8);
	new DataView(b.buffer).setBigUint64(0, BigInt(n));
	return b;
};
const i32 = (n: number) => {
	const b = new Uint8Array(4);
	new DataView(b.buffer).setInt32(0, n);
	return b;
};

export const concat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

export const box = (type: string, ...children: Uint8Array[]) => {
	const body = concat(...children);
	return concat(u32(8 + body.length), enc.encode(type), body);
};

const full = (type: string, version: number, ...payload: Uint8Array[]) =>
	box(type, new Uint8Array([version, 0, 0, 0]), ...payload);

export const ftyp = (brand: string) => box("ftyp", enc.encode(brand), u32(0), enc.encode(brand));

export const mvhd = ({
	timescale,
	duration,
	version = 0,
}: {
	timescale: number;
	duration: number;
	version?: 0 | 1;
}) =>
	version === 0
		? full("mvhd", 0, u32(0), u32(0), u32(timescale), u32(duration), new Uint8Array(80))
		: full("mvhd", 1, u64(0), u64(0), u32(timescale), u64(duration), new Uint8Array(80));

const ONE = 0x10000;
/** `tkhd` matrix a, b, c, d for a clockwise rotation. */
const ROTATION: Record<number, [number, number, number, number]> = {
	0: [ONE, 0, 0, ONE],
	90: [0, ONE, -ONE, 0],
	180: [-ONE, 0, 0, -ONE],
	270: [0, -ONE, ONE, 0],
};

export const tkhd = ({
	width,
	height,
	rotation = 0,
	version = 0,
}: {
	width: number;
	height: number;
	rotation?: 0 | 90 | 180 | 270;
	version?: 0 | 1;
}) => {
	const [a, b, c, d] = ROTATION[rotation]!;
	const head =
		version === 0
			? concat(u32(0), u32(0), u32(1), u32(0), u32(0))
			: concat(u64(0), u64(0), u32(1), u32(0), u64(0));
	const matrix = concat(
		i32(a),
		i32(b),
		u32(0),
		i32(c),
		i32(d),
		u32(0),
		u32(0),
		u32(0),
		u32(0x40000000)
	);
	return full(
		"tkhd",
		version,
		head,
		new Uint8Array(16),
		matrix,
		u32(width * ONE),
		u32(height * ONE)
	);
};

export const hdlr = (handler: string) =>
	full("hdlr", 0, u32(0), enc.encode(handler), new Uint8Array(13));

export const stsd = (codec: string) => full("stsd", 0, u32(1), box(codec, new Uint8Array(78)));

/** A big sample table, so walks have to hop over real bytes. */
export const stsz = (entries: number) =>
	full("stsz", 0, u32(0), u32(entries), new Uint8Array(entries * 4));

export const trak = ({
	handler = "vide",
	codec = "avc1",
	width = 1920,
	height = 1080,
	rotation = 0,
	extra = [],
	mdiaExtra = [],
	minfExtra = [],
	stblExtra = [],
}: {
	handler?: string;
	codec?: string;
	width?: number;
	height?: number;
	rotation?: 0 | 90 | 180 | 270;
	extra?: Uint8Array[];
	/** Boxes after `minf` in `mdia`, after `stbl` in `minf`, after the sample table in `stbl`. */
	mdiaExtra?: Uint8Array[];
	minfExtra?: Uint8Array[];
	stblExtra?: Uint8Array[];
} = {}) =>
	box(
		"trak",
		tkhd({ width, height, rotation }),
		box(
			"mdia",
			full("mdhd", 0, new Uint8Array(20)),
			hdlr(handler),
			box("minf", box("stbl", stsd(codec), stsz(2000), ...stblExtra), ...minfExtra),
			...mdiaExtra
		),
		...extra
	);

/** `udta` with an Apple `©xyz` location atom. */
export const udtaLocation = () => box("udta", box("©xyz", enc.encode("+37.33-122.03/")));
/** QuickTime `meta` with an ISO 6709 location key. */
export const metaLocation = () =>
	box(
		"meta",
		full("hdlr", 0, u32(0), enc.encode("mdta")),
		box("keys", enc.encode("com.apple.quicktime.location.ISO6709"))
	);

export type MovieOptions = {
	brand?: string;
	codec?: string;
	durationMs?: number;
	width?: number;
	height?: number;
	rotation?: 0 | 90 | 180 | 270;
	/** `moov` after `mdat`, as cameras write it. */
	moovAtEnd?: boolean;
	/** Bytes of `mdat` payload: a sparse gap. */
	mdatSize?: number;
	moovExtra?: Uint8Array[];
	trakExtra?: Uint8Array[];
	mdiaExtra?: Uint8Array[];
	minfExtra?: Uint8Array[];
	stblExtra?: Uint8Array[];
	topExtra?: Uint8Array[];
};

/** A sparse file: byte parts at offsets, zeros in between. */
export type SparseFile = { size: number; parts: { offset: number; bytes: Uint8Array }[] };

export function movie({
	brand = "isom",
	codec = "avc1",
	durationMs = 10_000,
	width = 1920,
	height = 1080,
	rotation = 0,
	moovAtEnd = false,
	mdatSize = 1000,
	moovExtra = [],
	trakExtra = [],
	mdiaExtra = [],
	minfExtra = [],
	stblExtra = [],
	topExtra = [],
}: MovieOptions = {}): SparseFile {
	const moov = box(
		"moov",
		mvhd({ timescale: 600, duration: Math.round((durationMs * 600) / 1000) }),
		trak({ codec, width, height, rotation, extra: trakExtra, mdiaExtra, minfExtra, stblExtra }),
		trak({ handler: "soun", codec: "mp4a", width: 0, height: 0 }),
		...moovExtra
	);
	const mdatHead = concat(u32(8 + mdatSize), enc.encode("mdat"));
	const head = concat(ftyp(brand), ...topExtra);
	if (moovAtEnd) {
		const first = concat(head, mdatHead);
		return {
			size: first.length + mdatSize + moov.length,
			parts: [
				{ offset: 0, bytes: first },
				{ offset: first.length + mdatSize, bytes: moov },
			],
		};
	}
	const first = concat(head, moov, mdatHead);
	return { size: first.length + mdatSize, parts: [{ offset: 0, bytes: first }] };
}

/** `readRange` over a sparse file, counting reads. */
export function sparseReader(file: SparseFile) {
	const stats = { reads: 0, bytes: 0 };
	const read = async (offset: number, length: number) => {
		stats.reads++;
		const len = Math.max(0, Math.min(length, file.size - offset));
		stats.bytes += len;
		const out = new Uint8Array(len);
		for (const p of file.parts) {
			const from = Math.max(offset, p.offset);
			const to = Math.min(offset + len, p.offset + p.bytes.length);
			if (from < to) out.set(p.bytes.subarray(from - p.offset, to - p.offset), from - offset);
		}
		return out;
	};
	return { read, stats };
}

/** Whole bytes of a (small) sparse file, for `Blob`-based tests. */
export const materialize = (file: SparseFile) => {
	const out = new Uint8Array(file.size);
	for (const p of file.parts) out.set(p.bytes, p.offset);
	return out;
};
