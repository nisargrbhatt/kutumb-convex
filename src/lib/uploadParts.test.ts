import { describe, expect, it } from "vitest";
import { putParts, type PutPart } from "./uploadParts";

const video = new Blob([new Uint8Array(8)]);
const poster = new Blob([new Uint8Array(2)]);
const parts = (): PutPart[] => [
	{ variant: "video", body: video },
	{ variant: "poster", body: poster, optional: true },
];

describe("putParts", () => {
	it("sends every part in order and reports them", async () => {
		const sent: string[] = [];
		const progress: number[] = [];
		const result = await putParts(
			parts(),
			async (variant, _body, onBytes) => {
				sent.push(variant);
				onBytes(1);
			},
			(f) => progress.push(f),
			new AbortController().signal
		);
		expect(sent).toEqual(["video", "poster"]);
		expect(result).toEqual(["video", "poster"]);
		expect(progress.at(-1)).toBe(1);
	});

	it("an optional part failing is skipped: the upload still succeeds without it", async () => {
		const progress: number[] = [];
		const result = await putParts(
			parts(),
			async (variant) => {
				if (variant === "poster") throw new Error("poster PUT failed");
			},
			(f) => progress.push(f),
			new AbortController().signal
		);
		expect(result).toEqual(["video"]);
		expect(progress.at(-1)).toBe(1);
	});

	it("a required part failing rejects", async () => {
		await expect(
			putParts(
				parts(),
				async (variant) => {
					if (variant === "video") throw new Error("video PUT failed");
				},
				() => {},
				new AbortController().signal
			)
		).rejects.toThrow("video PUT failed");
	});

	it("cancelling during an optional part still cancels the upload", async () => {
		const ac = new AbortController();
		await expect(
			putParts(
				parts(),
				async (variant) => {
					if (variant === "poster") {
						ac.abort();
						throw new DOMException("Upload cancelled", "AbortError");
					}
				},
				() => {},
				ac.signal
			)
		).rejects.toMatchObject({ name: "AbortError" });
	});
});
