import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { PENDING_REQUEST_LIMIT } from "@/domain/limits";
import { listMyRequests, listPendingByProfile } from "@/domain/queries/changeRequests";
import { ADMIN, MEMBER, OTHER, OWNER, profileChangesHarness } from "@/test/profileChangesHarness";

async function expectError(p: Promise<unknown>, kind: AppError["kind"]) {
	const e = await p.then(
		() => null,
		(err: unknown) => err
	);
	expect(e).toBeInstanceOf(AppError);
	expect((e as AppError).kind).toBe(kind);
}

const meta = (blobId: string) => ({
	blobId,
	sha256: "ab".repeat(32),
	size: 94_000,
	width: 1024,
	height: 1024,
});

describe("photo Change Request on an active Userless Profile", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "ul" });
	});

	const photo = (blobId: string | null, actor = MEMBER) =>
		h.changes.submit(actor, { kind: "photo", profileId: "ul", blobId });

	/** Owner sets `b0` directly, so requests have a base. */
	async function withBase() {
		await h.seedBlob({ id: "b0", uploadedByUserId: "u-owner" });
		await photo("b0", OWNER);
	}

	async function requested(blobId: string | null, actor = MEMBER) {
		const res = await photo(blobId, actor);
		if (res.outcome !== "requested") throw new Error(`expected requested, got ${res.outcome}`);
		return res.changeRequestId;
	}

	it("member proposes: request pending, Blob owned by it, avatar unchanged", async () => {
		await withBase();
		await h.seedBlob({ id: "b1" });
		const id = await requested("b1");

		expect(await h.request(id)).toMatchObject({
			kind: "photo",
			status: "pending",
			targetId: null,
			payload: { base: "b0", proposed: "b1" },
			submitterUserId: "u-member",
		});
		expect(await h.blob("b1")).toMatchObject({
			status: "attached",
			ownerKind: "changeRequest",
			ownerId: id,
			size: 94_000,
		});
		expect((await h.profile("ul"))?.photoBlobId).toBe("b0");
		expect(await h.version()).toBe(1);
		const ev = (await h.events()).find((e) => e.action === "change_request.submitted");
		expect(ev?.payload).toEqual({ kind: "photo", photo: [meta("b0"), meta("b1")] });
	});

	it("remove is a request too; a repeat returns the same request", async () => {
		await withBase();
		const id = await requested(null);
		expect((await h.request(id))?.payload).toEqual({ base: "b0", proposed: null });
		expect(await photo(null)).toEqual({
			outcome: "unchanged",
			profileId: "ul",
			changeRequestId: id,
		});
		expect((await h.profile("ul"))?.photoBlobId).toBe("b0");
	});

	it("no photo and remove → unchanged, nothing filed", async () => {
		expect(await photo(null)).toEqual({ outcome: "unchanged", profileId: "ul" });
		expect(await h.db.query.changeRequest.findMany()).toEqual([]);
	});

	it("invalid upload → Invalid, nothing filed", async () => {
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-other" });
		await expectError(photo("b1"), "Invalid");
		expect(await h.db.query.changeRequest.findMany()).toEqual([]);
	});

	it("counts toward the pending request limit", async () => {
		for (let i = 0; i <= PENDING_REQUEST_LIMIT; i++) await h.seedBlob({ id: `b${i}` });
		for (let i = 0; i < PENDING_REQUEST_LIMIT; i++) await requested(`b${i}`);
		await expectError(photo(`b${PENDING_REQUEST_LIMIT}`), "LimitReached");
	});

	it("approve: owner fields move to the profile, one photo Audit Event, old bytes go", async () => {
		await withBase();
		await h.seedBlob({ id: "b1" });
		const id = await requested("b1");
		await h.changes.review(ADMIN, id, { decision: "approve" });

		expect((await h.profile("ul"))?.photoBlobId).toBe("b1");
		expect(await h.blob("b1")).toMatchObject({
			status: "attached",
			ownerKind: "profile",
			ownerId: "ul",
		});
		expect((await h.blob("b0"))?.status).toBe("deleted");
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b0", mediaKind: "profilePhoto" }] },
		]);
		const evs = (await h.events()).filter(
			(e) => e.action === "profile.photo_changed" && e.changeRequestId === id
		);
		expect(evs).toHaveLength(1);
		expect(evs[0]?.payload).toEqual([meta("b0"), meta("b1")]);
		expect((await h.request(id))?.status).toBe("approved");
	});

	it("approve a removal: column cleared, old bytes go", async () => {
		await withBase();
		const id = await requested(null);
		await h.changes.review(OWNER, id, { decision: "approve" });
		expect((await h.profile("ul"))?.photoBlobId).toBeNull();
		expect((await h.blob("b0"))?.status).toBe("deleted");
		expect(h.purged).toHaveLength(1);
	});

	it("base changed: stale with the Photo label, approve blocked, bytes kept until closed", async () => {
		await withBase();
		await h.seedBlob({ id: "b1" }, { id: "b2", uploadedByUserId: "u-owner" });
		const id = await requested("b1");
		await photo("b2", OWNER);

		const [group] = await listPendingByProfile(h.db, OWNER);
		expect(group?.requests[0]?.stale).toEqual({ code: "fields_changed", fields: ["photo"] });
		const [mine] = await listMyRequests(h.db, MEMBER);
		expect(mine?.stale).toEqual({ code: "fields_changed", fields: ["photo"] });

		await expectError(h.changes.review(ADMIN, id, { decision: "approve" }), "Stale");
		expect((await h.blob("b1"))?.status).toBe("attached");
		expect((await h.profile("ul"))?.photoBlobId).toBe("b2");

		await h.changes.review(ADMIN, id, { decision: "reject", note: "Changed" });
		expect((await h.blob("b1"))?.status).toBe("deleted");
	});

	it("reject deletes the proposed bytes; Audit keeps metadata", async () => {
		await h.seedBlob({ id: "b1" });
		const id = await requested("b1");
		await h.changes.review(ADMIN, id, { decision: "reject", note: "Blurry" });
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b1", mediaKind: "profilePhoto" }] },
		]);
		const ev = (await h.events()).find((e) => e.action === "change_request.submitted");
		expect(ev?.payload).toEqual({ kind: "photo", photo: [null, meta("b1")] });
		expect((await h.profile("ul"))?.photoBlobId).toBeNull();
	});

	it("withdraw deletes the proposed bytes", async () => {
		await h.seedBlob({ id: "b1" });
		const id = await requested("b1");
		await h.changes.withdraw(MEMBER, id);
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toHaveLength(1);
	});

	it("reassign supersedes a pending photo request and deletes its bytes", async () => {
		await h.seedBlob({ id: "b1" });
		const id = await requested("b1");
		await h.changes.reassign(OWNER, "ul", "u-other");
		expect((await h.request(id))?.status).toBe("superseded");
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b1", mediaKind: "profilePhoto" }] },
		]);
	});

	it("deactivate and delete supersede it too", async () => {
		await h.seedBlob({ id: "b1" }, { id: "b2" });
		await requested("b1");
		await h.changes.deactivate(OWNER, "ul");
		expect((await h.blob("b1"))?.status).toBe("deleted");
		await h.changes.reactivate(OWNER, "ul");
		await requested("b2");
		await h.changes.remove(OWNER, "ul");
		expect((await h.blob("b2"))?.status).toBe("deleted");
		expect(h.purged.flatMap((p) => p.blobs.map((b) => b.id))).toEqual(["b1", "b2"]);
	});

	it("overlaps with another pending photo request", async () => {
		await h.seedBlob({ id: "b1" }, { id: "b2", uploadedByUserId: "u-other" });
		const a = await requested("b1");
		const b = await requested("b2", OTHER);
		const [group] = await listPendingByProfile(h.db, OWNER);
		expect(group?.requests.map((r) => [r.id, r.overlapsWith])).toEqual([
			[a, [b]],
			[b, [a]],
		]);
	});

	it("approving one makes the other stale", async () => {
		await h.seedBlob({ id: "b1" }, { id: "b2", uploadedByUserId: "u-other" });
		const a = await requested("b1");
		const b = await requested("b2", OTHER);
		await h.changes.review(OWNER, a, { decision: "approve" });
		await expectError(h.changes.review(OWNER, b, { decision: "approve" }), "Stale");
	});
});
