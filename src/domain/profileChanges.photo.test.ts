import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import { PENDING_TTL_MS } from "@/domain/blob";
import {
	ADMIN,
	MEMBER,
	OTHER,
	OWNER,
	input,
	profileChangesHarness,
} from "@/test/profileChangesHarness";

async function expectError(p: Promise<unknown>, kind: AppError["kind"]) {
	const e = await p.then(
		() => null,
		(err: unknown) => err
	);
	expect(e).toBeInstanceOf(AppError);
	expect((e as AppError).kind).toBe(kind);
}

const meta = (blobId: string, sha = "ab") => ({
	blobId,
	sha256: sha.repeat(32),
	size: 94_000,
	width: 1024,
	height: 1024,
});

describe("Profile Photo on the linked user's own profile", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "me", userId: "u-member" }, { id: "them", userId: "u-other" }, { id: "ul" });
	});

	const photo = (blobId: string | null, actor = MEMBER, profileId = "me") =>
		h.changes.submit(actor, { kind: "photo", profileId, blobId });
	const photoEvents = async () =>
		(await h.events()).filter((e) => e.action === "profile.photo_changed");

	it("set: attaches the Blob, bumps both versions, audits metadata only", async () => {
		await h.seedBlob({ id: "b1" });
		const res = await photo("b1");
		expect(res).toEqual({ outcome: "applied", profileId: "me", version: 1 });

		const p = await h.profile("me");
		expect(p?.photoBlobId).toBe("b1");
		expect(p?.version).toBe(1);
		expect(await h.version()).toBe(1);

		const b = await h.blob("b1");
		expect(b).toMatchObject({ status: "attached", ownerKind: "profile", ownerId: "me" });
		// Reservation becomes the real sum of landed variants.
		expect(b?.size).toBe(94_000);

		const [ev] = await photoEvents();
		expect(ev).toMatchObject({ profileId: "me", actorUserId: "u-member" });
		expect(ev?.payload).toEqual([null, meta("b1")]);
		expect(h.purged).toEqual([]);
	});

	it("replace: old Blob marked deleted in the batch, bytes purged after", async () => {
		await h.seedBlob({ id: "b1" }, { id: "b2", sha256: "cd".repeat(32) });
		await photo("b1");
		await photo("b2");

		expect((await h.profile("me"))?.photoBlobId).toBe("b2");
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect((await h.blob("b2"))?.status).toBe("attached");
		expect(await h.version()).toBe(2);
		const evs = await photoEvents();
		expect(evs[1]?.payload).toEqual([meta("b1"), meta("b2", "cd")]);
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b1", mediaKind: "profilePhoto" }] },
		]);
	});

	it("remove: clears the column, old Blob deleted and purged", async () => {
		await h.seedBlob({ id: "b1" });
		await photo("b1");
		const res = await photo(null);
		expect(res).toEqual({ outcome: "applied", profileId: "me", version: 2 });

		expect((await h.profile("me"))?.photoBlobId).toBeNull();
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect((await photoEvents())[1]?.payload).toEqual([meta("b1"), null]);
		expect(h.purged).toHaveLength(1);
	});

	it("no change (remove with none, same Blob again) → unchanged, nothing written", async () => {
		expect(await photo(null)).toEqual({ outcome: "unchanged", profileId: "me" });
		await h.seedBlob({ id: "b1" });
		await photo("b1");
		expect(await photo("b1")).toEqual({ outcome: "unchanged", profileId: "me" });
		expect(await photoEvents()).toHaveLength(1);
		expect(await h.version()).toBe(1);
	});

	it("someone else's linked profile → Forbidden", async () => {
		await h.seedBlob({ id: "b1" });
		await expectError(photo("b1", MEMBER, "them"), "Forbidden");
		expect((await h.blob("b1"))?.status).toBe("pending");
	});

	it.each([
		["uploaded by someone else", { uploadedByUserId: "u-other" }],
		["not pending", { status: "attached" as const }],
		["expired", { createdAt: new Date(1000 - PENDING_TTL_MS - 1) }],
		["wrong media kind", { mediaKind: "memoryImage" as const }],
		["required variant missing", { variants: { avatar: 4000 } }],
	])("Blob %s → Invalid, nothing written", async (_label, over) => {
		await h.seedBlob({ id: "b1", ...over });
		await expectError(photo("b1"), "Invalid");
		expect((await h.profile("me"))?.photoBlobId).toBeNull();
		expect(await h.version()).toBe(0);
	});

	it("Blob of another org → Invalid", async () => {
		h.fresh.sqlite.exec(
			"INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'Org 2', 'o2', 0)"
		);
		await h.seedBlob({ id: "b1", organizationId: "o2" });
		await expectError(photo("b1"), "Invalid");
	});

	it("Blob discarded mid-change → batch rolls back as Conflict", async () => {
		await h.seedBlob({ id: "b1" });
		h.beforeNextBatch("UPDATE blob SET status = 'deleted' WHERE id = 'b1'");
		await expectError(photo("b1"), "Conflict");
		expect((await h.profile("me"))?.photoBlobId).toBeNull();
		expect(await h.version()).toBe(0);
		expect(await photoEvents()).toHaveLength(0);
	});

	it("photo changed concurrently → Conflict, the other change stands", async () => {
		await h.seedBlob({ id: "b1" }, { id: "b2" });
		h.beforeNextBatch("UPDATE communityProfile SET photoBlobId = 'b2' WHERE id = 'me'");
		await expectError(photo("b1"), "Conflict");
		expect((await h.profile("me"))?.photoBlobId).toBe("b2");
		expect((await h.blob("b1"))?.status).toBe("pending");
	});

	it("the other linked user can still set their own", async () => {
		await h.seedBlob({ id: "b9", uploadedByUserId: "u-other" });
		expect((await photo("b9", OTHER, "them")).outcome).toBe("applied");
	});
});

describe("Profile Photo on a Userless Profile", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "ul" }, { id: "gone", status: "inactive" });
	});

	const photo = (blobId: string | null, actor = OWNER, profileId = "ul") =>
		h.changes.submit(actor, { kind: "photo", profileId, blobId });

	it.each([
		["owner", OWNER],
		["admin", ADMIN],
	])("%s sets, replaces and removes directly", async (_label, actor) => {
		await h.seedBlob(
			{ id: "b1", uploadedByUserId: actor.userId },
			{ id: "b2", uploadedByUserId: actor.userId }
		);
		expect((await photo("b1", actor)).outcome).toBe("applied");
		expect((await photo("b2", actor)).outcome).toBe("applied");
		expect((await h.profile("ul"))?.photoBlobId).toBe("b2");
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect((await photo(null, actor)).outcome).toBe("applied");
		expect((await h.profile("ul"))?.photoBlobId).toBeNull();
		expect((await h.blob("b2"))?.status).toBe("deleted");
		expect(h.purged).toHaveLength(2);
	});

	it("owner/admin on an inactive Userless Profile too", async () => {
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-admin" });
		expect((await photo("b1", ADMIN, "gone")).outcome).toBe("applied");
	});

	it("draft creator changes their own draft directly", async () => {
		const { profileId } = await h.changes.submit(MEMBER, { kind: "create", profile: input() });
		await h.seedBlob({ id: "b1" });
		expect((await photo("b1", MEMBER, profileId)).outcome).toBe("applied");
		expect((await h.profile(profileId))?.photoBlobId).toBe("b1");
		expect((await photo(null, MEMBER, profileId)).outcome).toBe("applied");
	});

	it("someone else's draft → NotFound", async () => {
		const { profileId } = await h.changes.submit(MEMBER, { kind: "create", profile: input() });
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-other" });
		await expectError(photo("b1", OTHER, profileId), "NotFound");
	});

	it("plain member on an inactive Userless Profile → NotFound, nothing filed", async () => {
		await h.seedBlob({ id: "b1" });
		await expectError(photo("b1", MEMBER, "gone"), "NotFound");
		expect((await h.blob("b1"))?.status).toBe("pending");
		expect(await h.db.query.changeRequest.findMany()).toEqual([]);
	});
});

describe("owner/admin on someone's linked profile", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "them", userId: "u-other" });
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-other" });
		await h.changes.submit(OTHER, { kind: "photo", profileId: "them", blobId: "b1" });
	});

	const photo = (blobId: string | null, actor: typeof OWNER) =>
		h.changes.submit(actor, { kind: "photo", profileId: "them", blobId });

	it.each([
		["owner", OWNER],
		["admin", ADMIN],
	])("%s may remove: Blob deleted, bytes purged, audited", async (_label, actor) => {
		expect((await photo(null, actor)).outcome).toBe("applied");
		expect((await h.profile("them"))?.photoBlobId).toBeNull();
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b1", mediaKind: "profilePhoto" }] },
		]);
		const ev = (await h.events()).find(
			(e) => e.action === "profile.photo_changed" && e.actorUserId === actor.userId
		);
		expect(ev?.payload).toEqual([meta("b1"), null]);
	});

	it.each([
		["owner", OWNER],
		["admin", ADMIN],
	])("%s may not set or replace → Forbidden", async (_label, actor) => {
		await h.seedBlob({ id: "b2", uploadedByUserId: actor.userId });
		await expectError(photo("b2", actor), "Forbidden");
		expect((await h.profile("them"))?.photoBlobId).toBe("b1");
		expect((await h.blob("b2"))?.status).toBe("pending");
	});

	it("plain member may not remove → Forbidden", async () => {
		await expectError(photo(null, MEMBER), "Forbidden");
		expect((await h.profile("them"))?.photoBlobId).toBe("b1");
	});
});

describe("profile delete takes the photo", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(() => {
		h = profileChangesHarness();
	});

	const deletedEvent = async () => (await h.events()).find((e) => e.action === "profile.deleted");

	it("owner delete: Blob deleted, bytes purged, snapshot carries photo metadata", async () => {
		await h.seed({ id: "ul" });
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-owner" });
		await h.changes.submit(OWNER, { kind: "photo", profileId: "ul", blobId: "b1" });

		await h.changes.remove(OWNER, "ul");
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toEqual([
			{ organizationId: "o1", blobs: [{ id: "b1", mediaKind: "profilePhoto" }] },
		]);
		expect((await deletedEvent())?.payload).toMatchObject({ photo: meta("b1") });
	});

	it("without a photo: snapshot photo null, nothing purged", async () => {
		await h.seed({ id: "ul" });
		await h.changes.remove(OWNER, "ul");
		expect((await deletedEvent())?.payload).toMatchObject({ photo: null });
		expect(h.purged).toEqual([]);
	});

	async function draftWithPhoto() {
		const res = await h.changes.submit(MEMBER, { kind: "create", profile: input() });
		if (res.outcome !== "requested") throw new Error("expected a draft");
		const { profileId, changeRequestId } = res;
		await h.seedBlob({ id: "b1" });
		await h.changes.submit(MEMBER, { kind: "photo", profileId, blobId: "b1" });
		return { profileId, changeRequestId };
	}

	it("rejected draft takes the bytes", async () => {
		const { changeRequestId } = await draftWithPhoto();
		await h.changes.review(ADMIN, changeRequestId, { decision: "reject", note: "Duplicate" });
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toHaveLength(1);
		expect((await deletedEvent())?.payload).toMatchObject({ photo: meta("b1") });
	});

	it("withdrawn draft takes the bytes", async () => {
		const { changeRequestId } = await draftWithPhoto();
		await h.changes.withdraw(MEMBER, changeRequestId);
		expect((await h.blob("b1"))?.status).toBe("deleted");
		expect(h.purged).toHaveLength(1);
	});

	it("approved draft keeps its photo", async () => {
		const { profileId, changeRequestId } = await draftWithPhoto();
		await h.changes.review(ADMIN, changeRequestId, { decision: "approve" });
		expect((await h.profile(profileId))?.photoBlobId).toBe("b1");
		expect((await h.blob("b1"))?.status).toBe("attached");
	});
});

describe("reassign keeps the photo", () => {
	it("photoBlobId and Blob unchanged after linking", async () => {
		const h = profileChangesHarness();
		await h.seed({ id: "ul" });
		await h.seedBlob({ id: "b1", uploadedByUserId: "u-owner" });
		await h.changes.submit(OWNER, { kind: "photo", profileId: "ul", blobId: "b1" });
		await h.changes.reassign(OWNER, "ul", "u-other");
		expect(await h.profile("ul")).toMatchObject({ userId: "u-other", photoBlobId: "b1" });
		expect((await h.blob("b1"))?.status).toBe("attached");
		expect(h.purged).toEqual([]);
	});
});
