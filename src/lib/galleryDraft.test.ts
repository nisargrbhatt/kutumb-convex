import { describe, expect, it } from "vitest";
import { makeGalleryDraft, type GalleryUpload } from "./galleryDraft";

type Pending = {
	file: string;
	resolve: (blobId: string) => void;
	reject: (e: Error) => void;
	progress: (p: number) => void;
	signal: AbortSignal;
};

/** Fake pipeline: each upload waits until the test resolves it; abort rejects it. */
function setup(attached: { blobId: string }[] = []) {
	const running: Pending[] = [];
	const discarded: string[] = [];
	const upload: GalleryUpload = (file, onProgress, signal) =>
		new Promise((resolve, reject) => {
			const p: Pending = {
				file: (file as unknown as { name: string }).name,
				resolve: (blobId) => resolve({ blobId, previewUrl: `blob:${blobId}` }),
				reject,
				progress: onProgress,
				signal,
			};
			signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
			running.push(p);
		});
	const draft = makeGalleryDraft({
		upload,
		discard: async (ids) => void discarded.push(...ids),
		releasePreview: () => {},
	});
	draft.reset(
		attached.map((a) => ({
			blobId: a.blobId,
			mediaKind: "memoryImage" as const,
			width: 10,
			height: 10,
			durationMs: null,
		}))
	);
	const file = (name: string) => ({ name }) as unknown as File;
	const tick = () => new Promise((r) => setTimeout(r, 0));
	return { draft, running, discarded, file, tick };
}

describe("gallery draft", () => {
	it("tracks progress, then yields Blob ids in order once uploads finish", async () => {
		const s = setup([{ blobId: "old" }]);
		s.draft.add([s.file("a.jpg"), s.file("b.jpg")]);
		s.running[0]!.progress(0.5);
		expect(s.draft.items().map((i) => i.state)).toEqual(["attached", "uploading", "uploading"]);
		expect(s.draft.items()[1]).toMatchObject({ progress: 0.5 });

		const settled = s.draft.settle();
		s.running[1]!.resolve("nb");
		s.running[0]!.resolve("na");
		expect(await settled).toEqual({ ok: true, blobIds: ["old", "na", "nb"] });
	});

	it("takes at most 5 in all and says how many it left out", () => {
		const s = setup([{ blobId: "old" }]);
		const left = s.draft.add(["1", "2", "3", "4", "5", "6"].map(s.file));
		expect(left).toBe(2);
		expect(s.draft.items()).toHaveLength(5);
	});

	it("a rejected file blocks posting until removed", async () => {
		const s = setup();
		s.draft.add([s.file("bad.heic"), s.file("ok.jpg")]);
		s.running[0]!.reject(new Error("This photo couldn't be read."));
		s.running[1]!.resolve("ok");
		expect(await s.draft.settle()).toEqual({ ok: false });
		expect(s.draft.items()[0]).toMatchObject({
			state: "error",
			error: "This photo couldn't be read.",
		});
		s.draft.remove(s.draft.items()[0]!.key);
		expect(await s.draft.settle()).toEqual({ ok: true, blobIds: ["ok"] });
	});

	it("removing an uploaded file discards it at once; an attached one only leaves the list", async () => {
		const s = setup([{ blobId: "old" }]);
		s.draft.add([s.file("a.jpg")]);
		s.running[0]!.resolve("na");
		await s.tick();
		s.draft.remove(s.draft.items()[1]!.key);
		s.draft.remove(s.draft.items()[0]!.key);
		await s.tick();
		expect(s.discarded).toEqual(["na"]);
		expect(await s.draft.settle()).toEqual({ ok: true, blobIds: [] });
	});

	it("removing a running upload aborts it", async () => {
		const s = setup();
		s.draft.add([s.file("a.jpg")]);
		s.draft.remove(s.draft.items()[0]!.key);
		expect(s.running[0]!.signal.aborted).toBe(true);
		expect(s.draft.items()).toEqual([]);
	});

	it("cancel aborts running uploads and discards everything uploaded since it opened", async () => {
		const s = setup([{ blobId: "old" }]);
		s.draft.add([s.file("a.jpg"), s.file("b.jpg")]);
		s.running[0]!.resolve("na");
		await s.tick();
		s.draft.cancel();
		await s.tick();
		expect(s.running[1]!.signal.aborted).toBe(true);
		expect(s.discarded).toEqual(["na"]);
		// Attached media is never discarded: Cancel restores it.
		expect(s.discarded).not.toContain("old");
	});

	it("an upload landing as cancel runs is discarded too", async () => {
		const s = setup();
		s.draft.add([s.file("a.jpg")]);
		// Resolved, but the draft hasn't heard yet when the Drawer closes.
		s.running[0]!.resolve("late");
		s.draft.cancel();
		await s.tick();
		expect(s.discarded).toContain("late");
	});

	it("after a save, close discards nothing", async () => {
		const s = setup();
		s.draft.add([s.file("a.jpg")]);
		s.running[0]!.resolve("na");
		await s.draft.settle();
		s.draft.saved();
		s.draft.cancel();
		await s.tick();
		expect(s.discarded).toEqual([]);
	});

	it("reorders with earlier and later", () => {
		const s = setup([{ blobId: "a" }, { blobId: "b" }]);
		s.draft.move(s.draft.items()[1]!.key, -1);
		expect(s.draft.items().map((i) => (i.state === "attached" ? i.blobId : ""))).toEqual([
			"b",
			"a",
		]);
	});
});
