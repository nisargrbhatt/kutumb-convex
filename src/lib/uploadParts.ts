import type { BlobVariant } from "@/db/constants";

/** One variant to `PUT`. An `optional` part (a video's `poster`) may fail without failing the item. */
export type PutPart = { variant: BlobVariant; body: Blob; optional?: boolean };

/**
 * `PUT` each part in order with overall progress (0.02 → 1). An optional part's failure is skipped
 * (spec: "A failure just means no poster"); a cancel always rejects. Returns the variants sent.
 */
export async function putParts(
	parts: PutPart[],
	put: (variant: BlobVariant, body: Blob, onBytes: (bytes: number) => void) => Promise<void>,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
) {
	const total = parts.reduce((n, p) => n + p.body.size, 0) || 1;
	const sent: BlobVariant[] = [];
	let done = 0;
	onProgress(0.02);
	for (const { variant, body, optional } of parts) {
		signal.throwIfAborted();
		try {
			await put(variant, body, (bytes) => onProgress(0.02 + (0.98 * (done + bytes)) / total));
			sent.push(variant);
		} catch (error) {
			if (!optional || signal.aborted) throw error;
		}
		done += body.size;
	}
	onProgress(1);
	return sent;
}
