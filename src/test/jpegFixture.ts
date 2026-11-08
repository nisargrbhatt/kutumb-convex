/**
 * Synthetic JPEGs shaped like WebKit's `canvas.toBlob("image/jpeg")` output (spec: Gaps this spec
 * filled): APP0 JFIF, then a 76-byte APP1 Exif and a 56-byte APP13 Photoshop block (segment length
 * fields), then tables, SOF0, SOS and scan data. Structure only; not decodable pixels.
 */
const seg = (marker: number, payload: number[]) => {
	const len = payload.length + 2;
	return [0xff, marker, len >> 8, len & 0xff, ...payload];
};
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const pad = (bytes: number[], to: number) => [...bytes, ...Array(to - bytes.length).fill(0)];

export const APP0 = seg(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
/** Length field 76. */
export const APP1_EXIF = seg(0xe1, pad(ascii("Exif\0\0MM\0*"), 74));
/** Length field 56. */
export const APP13_PHOTOSHOP = seg(0xed, pad(ascii("Photoshop 3.0\0"), 54));
export const COM = seg(0xfe, ascii("made by test"));
const DQT = seg(0xdb, pad([0], 65));
const sof0 = (width: number, height: number) =>
	seg(0xc0, [
		8,
		height >> 8,
		height & 0xff,
		width >> 8,
		width & 0xff,
		3,
		1,
		0x22,
		0,
		2,
		0x11,
		1,
		3,
		0x11,
		1,
	]);
const DHT = seg(0xc4, pad([0], 29));
const SOS = seg(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]);

export function jpeg({
	width = 1024,
	height = 768,
	extra = [APP1_EXIF, APP13_PHOTOSHOP],
	scanBytes = 64,
	withSos = true,
}: {
	width?: number;
	height?: number;
	/** Segments between APP0 and DQT. */
	extra?: number[][];
	scanBytes?: number;
	withSos?: boolean;
} = {}): Uint8Array<ArrayBuffer> {
	const head = [0xff, 0xd8, ...APP0, ...extra.flat(), ...DQT, ...sof0(width, height), ...DHT];
	if (!withSos) return new Uint8Array([...head, 0xff, 0xd9]) as Uint8Array<ArrayBuffer>;
	const scan = new Uint8Array(scanBytes).fill(0x5a);
	const out = new Uint8Array(head.length + SOS.length + scan.length + 2);
	out.set(head, 0);
	out.set(SOS, head.length);
	out.set(scan, head.length + SOS.length);
	out.set([0xff, 0xd9], out.length - 2);
	return out;
}

/** `readRange` over bytes, counting calls. */
export function rangeReader(bytes: Uint8Array) {
	const calls: [number, number][] = [];
	const read = async (offset: number, length: number) => {
		calls.push([offset, length]);
		return bytes.slice(offset, Math.min(offset + length, bytes.length));
	};
	return { read, calls };
}
