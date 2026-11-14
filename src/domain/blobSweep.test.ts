import { describe, expect, it, vi } from "vitest";
import type { mediaBlob } from "@/db/schema";
import { makeLimits, PENDING_UPLOAD_BYTES_LIMIT } from "@/domain/limits";
import { memberPendingBytes } from "@/domain/queries/blobs";
import { fakeR2 } from "@/test/fakeR2";
import { MEMBER, profileChangesHarness } from "@/test/profileChangesHarness";
import { PENDING_TTL_MS } from "./blob";
import { makeBlobStore } from "./blobStore";
import { makeBlobSweep } from "./blobSweep";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

function setup({
	budget,
	pageSize,
	markLimit,
}: { budget?: number; pageSize?: number; markLimit?: number } = {}) {
	const h = profileChangesHarness();
	const r2 = fakeR2();
	/** Counting fakes: every D1 statement and R2 call is one subrequest. */
	const calls = { n: 0 };
	const prepare = h.fresh.sqlite.prepare.bind(h.fresh.sqlite);
	h.fresh.sqlite.prepare = ((sql: string) => {
		calls.n++;
		return prepare(sql);
	}) as typeof h.fresh.sqlite.prepare;
	const realDelete = r2.bucket.delete.bind(r2.bucket);
	r2.bucket.delete = async (keys) => {
		calls.n++;
		return realDelete(keys);
	};
	const sweep = makeBlobSweep({
		db: h.db,
		bucket: r2.bucket,
		now: () => new Date(NOW),
		...(budget ? { budget } : {}),
		...(pageSize ? { pageSize } : {}),
		...(markLimit ? { markLimit } : {}),
	});
	/** A `profilePhoto` Blob with both variants' bytes in R2. */
	const blob = async (id: string, over: Partial<typeof mediaBlob.$inferInsert> = {}) => {
		await h.seedBlob({ id, createdAt: new Date(NOW - HOUR), ...over });
		for (const v of ["avatar", "display"]) {
			await r2.bucket.put(`o1/${id}/${v}`, new Uint8Array([1, 2, 3]));
		}
	};
	const hasBytes = (id: string) =>
		r2.objects.has(`o1/${id}/avatar`) || r2.objects.has(`o1/${id}/display`);
	return { h, r2, sweep, calls, blob, hasBytes };
}

describe("blob sweep", () => {
	it("expires pending older than 24h: bytes and row go; fresh pending stays", async () => {
		const s = setup();
		await s.blob("old", { createdAt: new Date(NOW - PENDING_TTL_MS - 1) });
		await s.blob("fresh");
		await s.sweep.run();
		expect(await s.h.blob("old")).toBeUndefined();
		expect(s.hasBytes("old")).toBe(false);
		expect((await s.h.blob("fresh"))?.status).toBe("pending");
		expect(s.hasBytes("fresh")).toBe(true);
	});

	it("an attached Blob whose profile is gone becomes deleted, then its bytes and row go", async () => {
		const s = setup();
		await s.h.seed({ id: "p" });
		await s.blob("live", { status: "attached", ownerKind: "profile", ownerId: "p" });
		await s.blob("orphan", { status: "attached", ownerKind: "profile", ownerId: "gone" });
		await s.sweep.run();
		expect(await s.h.blob("orphan")).toBeUndefined();
		expect(s.hasBytes("orphan")).toBe(false);
		expect((await s.h.blob("live"))?.status).toBe("attached");
		expect(s.hasBytes("live")).toBe(true);
	});

	it("a profile in another org doesn't keep a Blob alive", async () => {
		const s = setup();
		s.h.fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0);
			INSERT INTO communityProfile (id, firstName, lastName, status, organizationId)
				VALUES ('p2', 'A', 'B', 'active', 'o2');
		`);
		await s.blob("cross", { status: "attached", ownerKind: "profile", ownerId: "p2" });
		await s.sweep.run();
		expect(await s.h.blob("cross")).toBeUndefined();
	});

	it("a Memory lost to org delete takes its gallery Blobs; a live Memory keeps them", async () => {
		const s = setup();
		s.h.fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0), ('o3', 'Org 3', 'o3', 0);
			INSERT INTO post (id, organizationId, kind, authorUserId, authorName, createdAt)
				VALUES ('live', 'o1', 'memory', 'u-member', 'M', 0), ('doomed', 'o2', 'memory', 'u-member', 'M', 0),
					('elsewhere', 'o3', 'memory', 'u-member', 'M', 0);
		`);
		const mem = { status: "attached", ownerKind: "memory", mediaKind: "memoryImage" } as const;
		await s.blob("keep", { ...mem, ownerId: "live" });
		await s.blob("lost", { ...mem, organizationId: "o2", ownerId: "doomed" });
		// A post in another org never keeps a Blob alive.
		await s.blob("cross", { ...mem, ownerId: "elsewhere" });
		s.h.fresh.sqlite.exec(`DELETE FROM organization WHERE id = 'o2'`);
		await s.sweep.run();
		expect((await s.h.blob("keep"))?.status).toBe("attached");
		expect(await s.h.blob("lost")).toBeUndefined();
		expect(await s.h.blob("cross")).toBeUndefined();
	});

	it("a Change Request Blob lives only while its request is pending in the same org", async () => {
		const s = setup();
		s.h.fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0);
			INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status,
				submitterUserId, submitterName, createdAt) VALUES
				('cr-p', 'o1', 'p', 'P', 'photo', 'pending', 'u-member', 'M', 0),
				('cr-r', 'o1', 'p', 'P', 'photo', 'rejected', 'u-member', 'M', 0),
				('cr-x', 'o2', 'p', 'P', 'photo', 'pending', 'u-member', 'M', 0);
		`);
		const cr = (id: string, ownerId: string) =>
			s.blob(id, { status: "attached", ownerKind: "changeRequest", ownerId });
		await cr("live", "cr-p");
		await cr("closed", "cr-r");
		await cr("cross", "cr-x");
		await cr("gone", "nope");
		await s.sweep.run();
		expect((await s.h.blob("live"))?.status).toBe("attached");
		for (const id of ["closed", "cross", "gone"]) {
			expect(await s.h.blob(id)).toBeUndefined();
			expect(s.hasBytes(id)).toBe(false);
		}
	});

	it("retries byte deletes on deleted rows; a failed delete keeps the row for next run", async () => {
		const s = setup();
		await s.blob("d1", { status: "deleted" });
		const realDelete = s.r2.bucket.delete;
		s.r2.bucket.delete = async () => {
			throw new Error("R2 down");
		};
		await expect(s.sweep.run()).resolves.toBeDefined();
		expect((await s.h.blob("d1"))?.status).toBe("deleted");
		s.r2.bucket.delete = realDelete;
		await s.sweep.run();
		expect(await s.h.blob("d1")).toBeUndefined();
		expect(s.hasBytes("d1")).toBe(false);
	});

	it("stops at the subrequest budget; the rest wait for the next run", async () => {
		const s = setup({ budget: 6, pageSize: 2 });
		for (const id of ["a", "b", "c", "d", "e"]) await s.blob(id, { status: "deleted" });
		s.calls.n = 0;
		await s.sweep.run();
		expect(s.calls.n).toBeLessThanOrEqual(6);
		const left = () =>
			Promise.all(["a", "b", "c", "d", "e"].map((id) => s.h.blob(id))).then(
				(rows) => rows.filter(Boolean).length
			);
		expect(await left()).toBe(3);
		s.calls.n = 0;
		await s.sweep.run();
		expect(s.calls.n).toBeLessThanOrEqual(6);
		expect(await left()).toBe(1);
		await s.sweep.run();
		expect(await left()).toBe(0);
	});

	it("caps rows each mark step changes per run; the rest wait for the next run", async () => {
		const s = setup({ markLimit: 2, budget: 2 });
		for (const id of ["a", "b", "c"]) {
			await s.blob(`pend-${id}`, { createdAt: new Date(NOW - PENDING_TTL_MS - 1) });
			await s.blob(`orph-${id}`, { status: "attached", ownerKind: "profile", ownerId: "gone" });
		}
		expect(await s.sweep.run()).toMatchObject({ expired: 2, orphaned: 2 });
		expect(await s.sweep.run()).toMatchObject({ expired: 1, orphaned: 1 });
		expect(await s.sweep.run()).toMatchObject({ expired: 0, orphaned: 0 });
	});

	it("default budget is 40 subrequests", async () => {
		const s = setup({ pageSize: 1 });
		for (let i = 0; i < 30; i++) await s.blob(`x${i}`, { status: "deleted" });
		s.calls.n = 0;
		await s.sweep.run();
		expect(s.calls.n).toBeLessThanOrEqual(40);
		expect(s.calls.n).toBeGreaterThan(30);
	});
});

describe("pending cap without the sweep", () => {
	it("ignores expired pending rows, so a missed cron can't lock a member out", async () => {
		const h = profileChangesHarness();
		const now = () => new Date(NOW);
		await h.seedBlob({
			id: "stale",
			size: PENDING_UPLOAD_BYTES_LIMIT,
			createdAt: new Date(NOW - PENDING_TTL_MS - 1),
		});
		const store = makeBlobStore({
			db: h.db,
			bucket: fakeR2().bucket,
			limits: makeLimits(
				{
					userMemberships: async () => 0,
					orgMembersAndPending: async () => 0,
					orgProfiles: async () => 0,
					memberPendingBytes: (o, u, since) => memberPendingBytes(h.db, o, u, since),
				},
				vi.fn()
			),
			now,
			newId: () => "new",
		});
		await expect(store.start(MEMBER, { mediaKind: "profilePhoto", size: 1000 })).resolves.toEqual({
			blobId: "new",
		});
	});
});
