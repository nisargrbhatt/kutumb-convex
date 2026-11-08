import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/domain/errors";
import { LimitError, PENDING_UPLOAD_BYTES_LIMIT, makeLimits } from "@/domain/limits";
import { memberPendingBytes } from "@/domain/queries/blobs";
import { fakeR2 } from "@/test/fakeR2";
import { MEMBER, OTHER, profileChangesHarness } from "@/test/profileChangesHarness";
import { PENDING_TTL_MS } from "./blob";
import { makeBlobStore, purgeBlobs } from "./blobStore";

const MB = 1_000_000;

function setup() {
	const h = profileChangesHarness();
	const r2 = fakeR2();
	let t = 1_700_000_000_000;
	const clock = { now: () => new Date(t), advance: (ms: number) => (t += ms) };
	let n = 0;
	const limits = makeLimits(
		{
			userMemberships: async () => 0,
			orgMembersAndPending: async () => 0,
			orgProfiles: async () => 0,
			memberPendingBytes: (org, user, since) => memberPendingBytes(h.db, org, user, since),
		},
		vi.fn()
	);
	const store = makeBlobStore({
		db: h.db,
		bucket: r2.bucket,
		limits,
		now: clock.now,
		newId: () => `b${++n}`,
	});
	return { h, r2, clock, store };
}

/** Fills MEMBER's pending allowance with `memoryImage` reservations of up to 10 MiB each. */
async function fillPending(store: ReturnType<typeof makeBlobStore>) {
	const ids: string[] = [];
	let left = PENDING_UPLOAD_BYTES_LIMIT;
	while (left > 0) {
		const size = Math.min(left, 10 * 1024 * 1024);
		ids.push((await store.start(MEMBER, { mediaKind: "memoryImage", size })).blobId);
		left -= size;
	}
	return ids;
}

describe("blob store", () => {
	let s: ReturnType<typeof setup>;
	beforeEach(() => {
		s = setup();
	});

	describe("start", () => {
		it("reserves a pending row for the Actor in their active org", async () => {
			const { blobId } = await s.store.start(MEMBER, { mediaKind: "profilePhoto", size: 2 * MB });
			const row = await s.h.db.query.mediaBlob.findFirst({ where: (f, o) => o.eq(f.id, blobId) });
			expect(row).toMatchObject({
				organizationId: "o1",
				mediaKind: "profilePhoto",
				status: "pending",
				uploadedByUserId: MEMBER.userId,
				size: 2 * MB,
				variants: {},
				ownerKind: null,
			});
		});

		it("refuses a declared size over the kind's variants' caps", async () => {
			await expect(
				s.store.start(MEMBER, { mediaKind: "profilePhoto", size: 11 * 1024 * 1024 })
			).rejects.toBeInstanceOf(AppError);
		});

		it("video reserves with its declared, allow-listed content type", async () => {
			const { blobId } = await s.store.start(MEMBER, {
				mediaKind: "memoryVideo",
				size: 90_000_000,
				contentType: "video/quicktime",
			});
			expect(await s.h.blob(blobId)).toMatchObject({
				mediaKind: "memoryVideo",
				contentType: "video/quicktime",
				size: 90_000_000,
			});
		});

		it("video needs a content type and fits video plus poster caps; images take none", async () => {
			await expect(
				s.store.start(MEMBER, { mediaKind: "memoryVideo", size: MB })
			).rejects.toBeInstanceOf(AppError);
			await expect(
				s.store.start(MEMBER, {
					mediaKind: "memoryVideo",
					size: 95_000_000 + 5 * 1024 * 1024 + 1,
					contentType: "video/mp4",
				})
			).rejects.toBeInstanceOf(AppError);
			await expect(
				s.store.start(MEMBER, { mediaKind: "memoryImage", size: MB, contentType: "video/mp4" })
			).rejects.toBeInstanceOf(AppError);
		});

		it("throws LimitError past the pending cap; other members unaffected", async () => {
			await fillPending(s.store);
			await expect(
				s.store.start(MEMBER, { mediaKind: "memoryImage", size: 1 })
			).rejects.toBeInstanceOf(LimitError);
			await expect(
				s.store.start(OTHER, { mediaKind: "memoryImage", size: 1 })
			).resolves.toBeDefined();
		});

		it("expired pending rows don't count", async () => {
			await fillPending(s.store);
			s.clock.advance(PENDING_TTL_MS + 1);
			await expect(
				s.store.start(MEMBER, { mediaKind: "memoryImage", size: MB })
			).resolves.toBeDefined();
		});
	});

	describe("discard", () => {
		it("frees the pending reservation at once", async () => {
			const ids = await fillPending(s.store);
			await s.store.discard(MEMBER, [ids[0]!]);
			await expect(
				s.store.start(MEMBER, { mediaKind: "memoryImage", size: MB })
			).resolves.toBeDefined();
		});

		it("removes the row and every landed variant's bytes", async () => {
			const { blobId } = await s.store.start(MEMBER, { mediaKind: "memoryImage", size: MB });
			await s.r2.bucket.put(`o1/${blobId}/thumb`, new Uint8Array([1]));
			await s.r2.bucket.put(`o1/${blobId}/display`, new Uint8Array([2]));

			expect(await s.store.discard(MEMBER, [blobId])).toEqual({ discarded: [blobId] });

			expect(s.r2.objects.size).toBe(0);
			expect(
				await s.h.db.query.mediaBlob.findFirst({ where: (f, o) => o.eq(f.id, blobId) })
			).toBeUndefined();
		});

		it("never touches another member's or a non-pending Blob", async () => {
			const mine = (await s.store.start(MEMBER, { mediaKind: "memoryImage", size: MB })).blobId;
			const theirs = (await s.store.start(OTHER, { mediaKind: "memoryImage", size: MB })).blobId;
			s.h.fresh.sqlite.exec(`UPDATE blob SET status = 'attached' WHERE id = '${mine}'`);
			await s.r2.bucket.put(`o1/${mine}/thumb`, new Uint8Array([1]));

			expect(await s.store.discard(MEMBER, [mine, theirs])).toEqual({ discarded: [] });
			expect(s.r2.objects.size).toBe(1);
			const rows = await s.h.db.query.mediaBlob.findMany();
			expect(rows.map((r) => r.status).sort()).toEqual(["attached", "pending"]);
		});
	});

	describe("purgeBlobs (after a change marked them deleted)", () => {
		const purge = (blobs: { id: string; mediaKind: "profilePhoto" }[]) =>
			purgeBlobs({ db: s.h.db, bucket: s.r2.bucket }, "o1", blobs);

		it("deletes bytes, then the deleted row", async () => {
			await s.h.seedBlob({ id: "old", status: "deleted" });
			await s.r2.bucket.put("o1/old/avatar", new Uint8Array([1]));
			await s.r2.bucket.put("o1/old/display", new Uint8Array([2]));
			await purge([{ id: "old", mediaKind: "profilePhoto" }]);
			expect(s.r2.objects.size).toBe(0);
			expect(await s.h.blob("old")).toBeUndefined();
		});

		it("never removes a row that isn't deleted", async () => {
			await s.h.seedBlob({ id: "live", status: "attached" });
			await purge([{ id: "live", mediaKind: "profilePhoto" }]);
			expect((await s.h.blob("live"))?.status).toBe("attached");
		});

		it("byte delete failure keeps the row for the sweep, never throws", async () => {
			await s.h.seedBlob({ id: "old", status: "deleted" });
			s.r2.bucket.delete = async () => {
				throw new Error("r2 down");
			};
			vi.spyOn(console, "error").mockImplementation(() => {});
			await expect(purge([{ id: "old", mediaKind: "profilePhoto" }])).resolves.toBeUndefined();
			expect((await s.h.blob("old"))?.status).toBe("deleted");
		});
	});
});
