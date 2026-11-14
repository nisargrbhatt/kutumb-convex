import { createHash } from "node:crypto";
import type { BlobBucket } from "@/domain/blobStore";

/**
 * In-memory stand-in for the `BLOBS` R2 binding: the subset `BlobBucket` uses. Checks `sha256` like
 * R2 (proven against Miniflare in `blobRoute.miniflare.test.ts`). `onPut` runs mid-`put`, after the
 * body is read and before the object lands: a concurrent write racing the upload.
 */
export function fakeR2() {
	const objects = new Map<string, { bytes: Uint8Array; contentType?: string; etag: string }>();
	let n = 0;
	const hooks = { onPut: undefined as undefined | ((key: string) => Promise<void> | void) };

	const meta = (key: string) => {
		const o = objects.get(key)!;
		return {
			key,
			size: o.bytes.length,
			httpEtag: `"${o.etag}"`,
			etag: o.etag,
			httpMetadata: o.contentType ? { contentType: o.contentType } : {},
		};
	};

	const bucket: BlobBucket = {
		async put(key, value, options) {
			const bytes =
				value instanceof ReadableStream
					? new Uint8Array(await new Response(value).arrayBuffer())
					: new Uint8Array(ArrayBuffer.isView(value) ? value.buffer : value);
			if (options?.sha256) {
				const actual = createHash("sha256").update(bytes).digest("hex");
				if (actual !== options.sha256) throw new Error("put: The SHA-256 checksum did not match");
			}
			await hooks.onPut?.(key);
			objects.set(key, {
				bytes,
				contentType: options?.httpMetadata?.contentType,
				etag: `e${++n}`,
			});
			return meta(key);
		},
		async get(key, options) {
			const o = objects.get(key);
			if (!o) return null;
			// Like R2 (checked on Miniflare): a range normalises to `{ offset, length }`, clamped to
			// the object; a start at or past the end throws.
			const r = options?.range;
			let range: { offset: number; length: number } | undefined;
			if (r) {
				const size = o.bytes.length;
				const offset = "suffix" in r ? Math.max(0, size - r.suffix) : r.offset;
				if (offset >= size) throw new Error("get: The requested range is not satisfiable (10039)");
				const length = "suffix" in r ? size - offset : Math.min(r.length ?? size, size - offset);
				range = { offset, length };
			}
			const bytes = range ? o.bytes.slice(range.offset, range.offset + range.length) : o.bytes;
			return {
				...meta(key),
				...(range ? { range } : {}),
				body: new Response(bytes as Uint8Array<ArrayBuffer>).body!,
				arrayBuffer: async () => bytes.slice().buffer,
			};
		},
		async head(key) {
			return objects.has(key) ? meta(key) : null;
		},
		async delete(keys) {
			for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
		},
	};

	return { bucket, objects, hooks };
}
