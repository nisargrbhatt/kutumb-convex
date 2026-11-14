import { BLOB_MEDIA_KIND, type BlobMediaKind } from "@/db/constants";
import type { GalleryItem } from "@/domain/feed";
import { moveItem } from "@/domain/gallery";
import { GALLERY_MAX } from "@/domain/limits";

/**
 * The Memory Drawer's gallery while it is open (spec: Blobs > Lifecycle > Discard, Feed UI >
 * Drawer). No DOM: the upload pipeline is injected, so the discard rules are testable.
 *
 * - A `pending` file removed is discarded on click; a running one is aborted.
 * - An `attached` file removed only leaves the list: the save marks it, Cancel restores it.
 * - `cancel()` (any close without a save) aborts running uploads and discards every id uploaded
 *   since the Drawer opened. After `saved()` it discards nothing.
 */

/** Uploads one picked file; rejects with a member-facing message, or an abort. */
export type GalleryUpload = (
	file: File,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
) => Promise<Uploaded>;

/** A landed upload: its `pending` Blob, plus a local preview (null: a video with no poster). */
export type Uploaded = { blobId: string; previewUrl: string | null; mediaKind: BlobMediaKind };

export type DraftItem = { key: string; name: string } & (
	| ({ state: "attached" } & GalleryItem)
	| { state: "uploading"; progress: number }
	| ({ state: "uploaded" } & Uploaded)
	| { state: "error"; error: string }
);

type Deps = {
	upload: GalleryUpload;
	/** Best effort; a missed discard falls to the 24h expiry. */
	discard: (blobIds: string[]) => Promise<unknown>;
	releasePreview: (url: string) => void;
};

export type SettleResult = { ok: true; blobIds: string[] } | { ok: false };

const message = (e: unknown) =>
	e instanceof Error && e.message ? e.message : "This photo couldn't be uploaded. Try again.";

export function makeGalleryDraft({ upload, discard, releasePreview }: Deps) {
	let items: DraftItem[] = [];
	let seq = 0;
	/** Running uploads by item key. */
	const running = new Map<string, { abort: AbortController; done: Promise<void> }>();
	/** `pending` ids this session uploaded and hasn't discarded or saved. */
	let unsaved = new Set<string>();
	/** Bumped by `cancel` / `reset`: a late upload from an older session is discarded. */
	let session = 0;
	const listeners = new Set<() => void>();

	const set = (next: DraftItem[]) => {
		items = next;
		for (const l of listeners) l();
	};
	const patch = (key: string, next: DraftItem) => set(items.map((i) => (i.key === key ? next : i)));
	const drop = (ids: string[]) => {
		for (const id of ids) unsaved.delete(id);
		if (ids.length > 0) void discard(ids).catch(() => undefined);
	};
	const release = (url: string | null) => {
		if (url) releasePreview(url);
	};
	const releaseAll = () => {
		for (const i of items) if (i.state === "uploaded") release(i.previewUrl);
	};
	const abortAll = () => {
		for (const r of running.values()) r.abort.abort();
		running.clear();
	};

	function start(file: File, key: string, name: string) {
		const abort = new AbortController();
		const mine = session;
		const done = upload(
			file,
			(progress) => {
				const cur = items.find((i) => i.key === key);
				if (cur?.state === "uploading" && running.has(key)) {
					patch(key, { ...cur, progress: Math.max(0, Math.min(1, progress)) });
				}
			},
			abort.signal
		).then(
			(uploaded) => {
				const live = mine === session && running.get(key)?.abort === abort;
				running.delete(key);
				if (!live) {
					release(uploaded.previewUrl);
					drop([uploaded.blobId]);
					return;
				}
				unsaved.add(uploaded.blobId);
				patch(key, { key, name, state: "uploaded", ...uploaded });
			},
			(error) => {
				const live = mine === session && running.get(key)?.abort === abort;
				running.delete(key);
				if (live) patch(key, { key, name, state: "error", error: message(error) });
			}
		);
		running.set(key, { abort, done });
	}

	return {
		items: () => items,
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => void listeners.delete(listener);
		},

		/** Opens on `attached` media (edit) or nothing (create). Nothing is discarded. */
		reset(attached: GalleryItem[]) {
			session++;
			abortAll();
			releaseAll();
			unsaved = new Set();
			set(
				attached.map((m, i) => ({
					...m,
					key: `a${++seq}`,
					name: `${m.mediaKind === BLOB_MEDIA_KIND.memoryVideo ? "Video" : "Photo"} ${i + 1}`,
					state: "attached" as const,
				}))
			);
		},

		/** Starts each file's upload; returns how many were left out past the gallery cap. */
		add(files: File[]) {
			const room = Math.max(0, GALLERY_MAX - items.length);
			const taken = files.slice(0, room);
			const added = taken.map((file) => ({
				key: `n${++seq}`,
				name: file.name,
				state: "uploading" as const,
				progress: 0,
				file,
			}));
			set([...items, ...added.map(({ file: _f, ...item }) => item)]);
			for (const a of added) start(a.file, a.key, a.name);
			return files.length - taken.length;
		},

		remove(key: string) {
			const item = items.find((i) => i.key === key);
			if (!item) return;
			const run = running.get(key);
			if (run) {
				running.delete(key);
				run.abort.abort();
			}
			if (item.state === "uploaded") {
				release(item.previewUrl);
				drop([item.blobId]);
			}
			set(items.filter((i) => i.key !== key));
		},

		move(key: string, by: -1 | 1) {
			set(
				moveItem(
					items,
					items.findIndex((i) => i.key === key),
					by
				)
			);
		},

		/** Waits for running uploads. Any rejected file blocks the save until it's removed. */
		async settle(): Promise<SettleResult> {
			while (running.size > 0) await Promise.all([...running.values()].map((r) => r.done));
			if (items.some((i) => i.state !== "attached" && i.state !== "uploaded")) return { ok: false };
			return {
				ok: true,
				blobIds: items.map((i) =>
					i.state === "attached" || i.state === "uploaded" ? i.blobId : ""
				),
			};
		},

		/** The save went through: its own close must not discard what it attached. */
		saved() {
			unsaved = new Set();
		},

		/** Any close without a save: abort, then discard what this session uploaded. */
		cancel() {
			session++;
			abortAll();
			drop([...unsaved]);
			releaseAll();
			set([]);
		},
	};
}

export type GalleryDraft = ReturnType<typeof makeGalleryDraft>;
