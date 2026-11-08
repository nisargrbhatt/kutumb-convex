import { beforeEach, describe, expect, it } from "vitest";
import { mediaBlob, postMemoryMedia } from "@/db/schema";
import { memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { PENDING_TTL_MS } from "@/domain/blob";
import { freshDb } from "@/test/sqliteDb";
import { getPost, listFeed } from "./feed";
import { createMemory, getMemoryForEdit, updateMemory } from "./memory";
import { removePost } from "./postBase";

const AUTHOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "u2", organizationId: "o1", role: "member" };
const ADMIN: Actor = { userId: "u3", organizationId: "o1", role: "admin" };

const NOW = 1_700_000_000_000;

describe("Memory gallery", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let seq = 0;
	let purged: { org: string; ids: string[] }[] = [];
	const deps = () => ({
		db,
		now: () => new Date(NOW),
		newId: () => `p${++seq}`,
		purgeBlobs: async (org: string, blobs: { id: string }[]) => {
			purged.push({ org, ids: blobs.map((b) => b.id).sort() });
		},
	});
	const share = (actor: Actor, media: string[], title = "T") =>
		createMemory(deps(), actor, "Snap", memoryInput.parse({ title, media }));
	const edit = (actor: Actor, postId: string, media: string[], title = "T") =>
		updateMemory(deps(), actor, postId, memoryInput.parse({ title, media }));

	/** A landed `memoryImage` Blob, `pending` and uploaded by `u1` unless overridden. */
	const blob = (id: string, over: Partial<typeof mediaBlob.$inferInsert> = {}) =>
		db.insert(mediaBlob).values({
			id,
			organizationId: "o1",
			mediaKind: "memoryImage",
			status: "pending",
			uploadedByUserId: "u1",
			size: 9_000_000,
			variants: { thumb: 100, display: 900 },
			width: 1600,
			height: 1200,
			createdAt: new Date(NOW - 1000),
			...over,
		});
	const row = (id: string) => db.query.mediaBlob.findFirst({ where: (f, o) => o.eq(f.id, id) });

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		seq = 0;
		purged = [];
		fresh.sqlite.exec(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);`
		);
	});

	it("creates with no images: empty gallery", async () => {
		const { postId } = await share(AUTHOR, []);
		expect((await getPost(db, AUTHOR, postId)).data).toMatchObject({ media: [] });
	});

	it("creates with 5 images: attached in order, sizes and dimensions on the card", async () => {
		const ids = ["b1", "b2", "b3", "b4", "b5"];
		for (const [i, id] of ids.entries()) await blob(id, { width: 100 + i, height: 50 });
		const { postId } = await share(AUTHOR, ["b3", "b1", "b5", "b2", "b4"]);

		const [card] = (await listFeed(db, OTHER, {})).posts;
		expect(card?.data).toMatchObject({
			media: [
				{ blobId: "b3", mediaKind: "memoryImage", width: 102, height: 50 },
				{ blobId: "b1", width: 100 },
				{ blobId: "b5" },
				{ blobId: "b2" },
				{ blobId: "b4" },
			],
		});
		expect((await getPost(db, OTHER, postId)).data.media).toHaveLength(5);
		const b3 = await row("b3");
		expect(b3).toMatchObject({ status: "attached", ownerKind: "memory", ownerId: postId });
		// Reservation becomes the real landed sum.
		expect(b3?.size).toBe(1000);
	});

	it("attaches videos with or without a poster; the card carries duration, type, poster flag", async () => {
		const video = {
			mediaKind: "memoryVideo" as const,
			contentType: "video/quicktime" as const,
			durationMs: 61_000,
			width: 1080,
			height: 1920,
		};
		await blob("v1", { ...video, variants: { video: 5000, poster: 300 } });
		await blob("v2", { ...video, contentType: "video/mp4", variants: { video: 4000 } });
		await blob("i1");
		await blob("v3", { ...video, variants: { poster: 300 } });
		await expect(share(AUTHOR, ["v3"])).rejects.toMatchObject({ kind: "Invalid" });

		await share(AUTHOR, ["v1", "i1", "v2"]);
		const [card] = (await listFeed(db, OTHER, {})).posts;
		expect(card?.data).toMatchObject({
			media: [
				{
					blobId: "v1",
					mediaKind: "memoryVideo",
					durationMs: 61_000,
					width: 1080,
					height: 1920,
					contentType: "video/quicktime",
					hasPoster: true,
				},
				{ blobId: "i1", mediaKind: "memoryImage", hasPoster: false },
				{ blobId: "v2", contentType: "video/mp4", hasPoster: false },
			],
		});
		expect((await row("v1"))?.size).toBe(5300);
	});

	it("refuses 6 images and a repeated id", () => {
		expect(() =>
			memoryInput.parse({ title: "T", media: ["a", "b", "c", "d", "e", "f"] })
		).toThrow();
		expect(() => memoryInput.parse({ title: "T", media: ["a", "a"] })).toThrow();
	});

	it.each([
		["another user's Blob", { uploadedByUserId: "u2" }],
		["another org's Blob", { organizationId: "o2" }],
		["an unfinished Blob", { variants: { thumb: 100 } }],
		["an expired Blob", { createdAt: new Date(NOW - PENDING_TTL_MS - 1) }],
		["a profile photo", { mediaKind: "profilePhoto" as const }],
		["a deleted Blob", { status: "deleted" as const }],
	])("refuses to attach %s, writing nothing", async (_name, over) => {
		await blob("ok");
		await blob("bad", over);
		await expect(share(AUTHOR, ["ok", "bad"])).rejects.toMatchObject({ kind: "Invalid" });
		expect((await listFeed(db, AUTHOR, {})).posts).toHaveLength(0);
		expect((await row("ok"))?.status).toBe("pending");
	});

	it("refuses a Blob already attached to another Memory", async () => {
		await blob("b1");
		await share(AUTHOR, ["b1"]);
		await expect(share(AUTHOR, ["b1"])).rejects.toMatchObject({ kind: "Invalid" });
		expect((await listFeed(db, AUTHOR, {})).posts).toHaveLength(1);
	});

	it("an unknown id is refused", async () => {
		await expect(share(AUTHOR, ["nope"])).rejects.toMatchObject({ kind: "Invalid" });
	});

	it("edit loads the attached gallery", async () => {
		await blob("b1");
		await blob("b2");
		const { postId } = await share(AUTHOR, ["b2", "b1"]);
		expect((await getMemoryForEdit(db, AUTHOR, postId)).media.map((m) => m.blobId)).toEqual([
			"b2",
			"b1",
		]);
	});

	it("edit reorders, adds and removes: removed media marked deleted and purged after save", async () => {
		await blob("b1");
		await blob("b2");
		await blob("b3");
		const { postId } = await share(AUTHOR, ["b1", "b2"]);
		await edit(AUTHOR, postId, ["b3", "b2"]);

		expect((await getPost(db, AUTHOR, postId)).data.media.map((m) => m.blobId)).toEqual([
			"b3",
			"b2",
		]);
		expect((await row("b3"))?.status).toBe("attached");
		expect((await row("b1"))?.status).toBe("deleted");
		expect(purged).toEqual([{ org: "o1", ids: ["b1"] }]);
	});

	it("an edit may empty the gallery", async () => {
		await blob("b1");
		const { postId } = await share(AUTHOR, ["b1"]);
		await edit(AUTHOR, postId, []);
		expect((await getPost(db, AUTHOR, postId)).data.media).toEqual([]);
		expect((await row("b1"))?.status).toBe("deleted");
	});

	it("a failed edit changes nothing: kept media stays, the new Blob stays pending", async () => {
		await blob("b1");
		await blob("b2");
		await blob("bad", { uploadedByUserId: "u2" });
		const { postId } = await share(AUTHOR, ["b1"]);
		await expect(edit(AUTHOR, postId, ["b2", "bad"])).rejects.toMatchObject({ kind: "Invalid" });
		expect((await getPost(db, AUTHOR, postId)).data.media.map((m) => m.blobId)).toEqual(["b1"]);
		expect((await row("b1"))?.status).toBe("attached");
		expect((await row("b2"))?.status).toBe("pending");
		expect(purged).toEqual([]);
	});

	it("an edit keeping media another save already removed is a Conflict", async () => {
		await blob("b1");
		const { postId } = await share(AUTHOR, ["b1"]);
		await db
			.update(mediaBlob)
			.set({ status: "deleted" })
			.where((await import("drizzle-orm")).eq(mediaBlob.id, "b1"));
		await expect(edit(AUTHOR, postId, ["b1"], "New")).rejects.toMatchObject({ kind: "Conflict" });
		expect((await getPost(db, AUTHOR, postId)).data.title).toBe("T");
	});

	it("can't move another Memory's media into this one", async () => {
		await blob("b1");
		await blob("b2");
		await share(AUTHOR, ["b1"]);
		const { postId } = await share(AUTHOR, ["b2"]);
		await expect(edit(AUTHOR, postId, ["b2", "b1"])).rejects.toMatchObject({ kind: "Invalid" });
	});

	it("removing a Memory marks every Blob deleted and purges their bytes", async () => {
		await blob("b1");
		await blob("b2");
		const { postId } = await share(AUTHOR, ["b1", "b2"]);
		await removePost(db, ADMIN, postId, deps());
		expect((await row("b1"))?.status).toBe("deleted");
		expect((await row("b2"))?.status).toBe("deleted");
		expect(await db.select().from(postMemoryMedia)).toEqual([]);
		expect(purged).toEqual([{ org: "o1", ids: ["b1", "b2"] }]);
	});
});
