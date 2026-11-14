import { createHash } from "node:crypto";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { makeLimits } from "@/domain/limits";
import { jpeg } from "@/test/jpegFixture";
import { MEMBER, profileChangesHarness } from "@/test/profileChangesHarness";
import { makeBlobRoute } from "./blobRoute";
import { makeBlobStore, type BlobBucket } from "./blobStore";

/** `put({ sha256 })` against local Miniflare R2, not the fake: proves R2 rejects a wrong hash. */
describe("blob route on Miniflare R2", () => {
	let mf: Miniflare;
	let bucket: BlobBucket;

	beforeAll(async () => {
		mf = new Miniflare({
			modules: true,
			script: "export default { fetch() { return new Response(null) } }",
			r2Buckets: ["BLOBS"],
		});
		const r2 = (await mf.getR2Bucket("BLOBS")) as unknown as BlobBucket;
		// A Node stream has no known length across Miniflare's proxy (workerd's request.body does),
		// so buffer it here; the sha256 check is still R2's.
		bucket = {
			get: r2.get.bind(r2),
			head: r2.head.bind(r2),
			delete: r2.delete.bind(r2),
			put: async (key, value, options) =>
				r2.put(
					key,
					value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value,
					options
				),
		};
	}, 30_000);
	afterAll(() => mf?.dispose());

	it("rejects a wrong sha256 and keeps nothing; accepts the right one", async () => {
		const h = profileChangesHarness();
		const now = () => new Date(1_700_000_000_000);
		const store = makeBlobStore({
			db: h.db,
			bucket,
			limits: makeLimits(
				{
					userMemberships: async () => 0,
					orgMembersAndPending: async () => 0,
					orgProfiles: async () => 0,
					memberPendingBytes: async () => 0,
				},
				vi.fn()
			),
			now,
			newId: () => "b1",
		});
		const route = makeBlobRoute({
			db: h.db,
			bucket,
			getUserId: async () => MEMBER.userId,
			sessionToken: () => "t",
			now,
		});
		await store.start(MEMBER, { mediaKind: "profilePhoto", size: 1_000_000 });
		const body = jpeg({ extra: [], width: 1000, height: 800 });
		const putWith = (sha256: string) =>
			route.fetch(
				new Request("https://k.test/api/blob/o1/b1/display", {
					method: "PUT",
					headers: {
						origin: "https://k.test",
						"content-length": String(body.length),
						"x-blob-sha256": sha256,
					},
					body,
				})
			);

		expect((await putWith("0".repeat(64))).status).toBe(400);
		expect(await bucket.head("o1/b1/display")).toBeNull();

		const right = createHash("sha256").update(body).digest("hex");
		expect((await putWith(right)).status).toBe(200);
		expect((await bucket.head("o1/b1/display"))?.size).toBe(body.length);
	}, 30_000);

	it("video: stored type, 206 for 0-1, suffix and open-ended; 416 past the end", async () => {
		const h = profileChangesHarness();
		h.fresh.sqlite.exec(`
			INSERT INTO post (id, organizationId, kind, authorUserId, authorName, createdAt)
				VALUES ('m1', 'o1', 'memory', 'u-owner', 'O', 0);
			INSERT INTO blob (id, organizationId, mediaKind, status, ownerKind, ownerId,
				uploadedByUserId, size, variants, contentType, createdAt)
			VALUES ('v1', 'o1', 'memoryVideo', 'attached', 'memory', 'm1', 'u-member', 1000,
				'{"video":1000}', 'video/quicktime', 0);
		`);
		const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 251);
		await bucket.put("o1/v1/video", bytes, { httpMetadata: { contentType: "video/quicktime" } });
		const route = makeBlobRoute({
			db: h.db,
			bucket,
			getUserId: async () => MEMBER.userId,
			sessionToken: () => "t",
			now: () => new Date(1_700_000_000_000),
		});
		const get = (range: string) =>
			route.fetch(new Request("https://k.test/api/blob/o1/v1/video", { headers: { range } }));

		const probe = await get("bytes=0-1");
		expect(probe.status).toBe(206);
		expect(probe.headers.get("content-type")).toBe("video/quicktime");
		expect(probe.headers.get("content-range")).toBe("bytes 0-1/1000");
		expect(new Uint8Array(await probe.arrayBuffer())).toEqual(bytes.slice(0, 2));
		const suffix = await get("bytes=-10");
		expect(suffix.headers.get("content-range")).toBe("bytes 990-999/1000");
		expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(bytes.slice(990));
		const open = await get("bytes=995-");
		expect(open.headers.get("content-range")).toBe("bytes 995-999/1000");
		expect((await open.arrayBuffer()).byteLength).toBe(5);
		const past = await get("bytes=1000-");
		expect(past.status).toBe(416);
		expect(past.headers.get("content-range")).toBe("bytes */1000");
	}, 30_000);
});
