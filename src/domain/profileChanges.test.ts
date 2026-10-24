import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { asc } from "drizzle-orm";
import { auditEvent, communityAddress, communityProfile, communityRelation } from "@/db/schema";
import type { CommunityProfileInput } from "@/domain/communityProfile";
import { AppError } from "@/domain/errors";
import { LimitError } from "@/domain/limits";
import type { Actor, Role } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { makeProfileChanges } from "./profileChanges";

const actor = (role: Role, userId = `u-${role}`): Actor => ({
	userId,
	organizationId: "o1",
	role,
});
const OWNER = actor("owner");
const ADMIN = actor("admin");
const MEMBER = actor("member");
const OTHER = actor("member", "u-other");

const input = (over: Partial<CommunityProfileInput> = {}): CommunityProfileInput => ({
	firstName: "Asha",
	middleName: null,
	lastName: "Patel",
	nickName: null,
	gender: "female",
	email: null,
	bloodGroup: null,
	mobileNumber: null,
	dateOfBirth: null,
	dateOfDeath: null,
	customFieldData: null,
	...over,
});

const address = {
	line1: "1 Main St",
	line2: null,
	country: "IN",
	state: "GJ",
	city: "Surat",
	postalCode: "395001",
	type: "home" as const,
	note: null,
	digipin: null,
};

async function expectError(p: Promise<unknown>, kind: AppError["kind"]) {
	const e = await p.then(
		() => null,
		(err: unknown) => err
	);
	expect(e).toBeInstanceOf(AppError);
	expect((e as AppError).kind).toBe(kind);
}

describe("makeProfileChanges", () => {
	let fresh: ReturnType<typeof freshDb>;
	let db: ReturnType<typeof freshDb>["db"];
	let assertProfileSlot: Mock<(organizationId: string, userId: string) => Promise<void>>;
	let changes: ReturnType<typeof makeProfileChanges>;

	const events = () =>
		db.select().from(auditEvent).orderBy(asc(auditEvent.createdAt), asc(auditEvent.id));
	const profile = (id: string) =>
		db.query.communityProfile.findFirst({ where: (f, o) => o.eq(f.id, id) });
	const version = async () =>
		(await db.query.orgDataVersion.findFirst({ where: (f, o) => o.eq(f.organizationId, "o1") }))
			?.version ?? 0;

	type Seed = Partial<typeof communityProfile.$inferInsert> & { id: string };
	const seed = (...rows: Seed[]) =>
		db.insert(communityProfile).values(
			rows.map((r) => ({
				firstName: r.id.toUpperCase(),
				lastName: "Doe",
				status: "active" as const,
				organizationId: "o1",
				...r,
			}))
		);

	beforeEach(() => {
		fresh = freshDb();
		db = fresh.db;
		fresh.sqlite.exec(`
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
				('u-owner', 'Olga Owner', 'o@x.test', 1, 0, 0),
				('u-admin', 'Adi Admin', 'a@x.test', 1, 0, 0),
				('u-member', 'Mira Member', 'm@x.test', 1, 0, 0),
				('u-other', 'Otto Other', 'x@x.test', 1, 0, 0),
				('u-new', 'Nia New', 'n@x.test', 1, 0, 0);
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0);
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
				('m1', 'o1', 'u-owner', 'owner', 0),
				('m2', 'o1', 'u-admin', 'admin', 0),
				('m3', 'o1', 'u-member', 'member', 0),
				('m4', 'o1', 'u-other', 'member', 0),
				('m5', 'o1', 'u-new', 'member', 0);
		`);
		assertProfileSlot = vi.fn(async () => {});
		let t = 1000;
		let n = 0;
		changes = makeProfileChanges({
			db,
			limits: { assertProfileSlot },
			now: () => new Date(t++),
			newId: () => `id${++n}`,
		});
	});

	describe("submit create", () => {
		it("owner/admin create a Userless Profile → active + profile.created snapshot", async () => {
			const res = await changes.submit(ADMIN, { kind: "create", profile: input() });

			expect(res).toEqual({ outcome: "applied", profileId: "id1", version: 0 });
			const row = await profile("id1");
			expect(row).toMatchObject({ status: "active", userId: null, firstName: "Asha" });
			const [ev] = await events();
			expect(ev).toMatchObject({
				action: "profile.created",
				actorUserId: "u-admin",
				actorName: "Adi Admin",
				actorRole: "admin",
				profileId: "id1",
				profileName: "Asha Patel",
				changeRequestId: null,
			});
			expect(ev!.payload).toMatchObject({ firstName: "Asha", status: "active" });
			expect(await version()).toBe(1);
		});

		it("member create → draft + pending create request + change_request.submitted", async () => {
			const res = await changes.submit(MEMBER, { kind: "create", profile: input() });

			expect(res).toEqual({ outcome: "requested", profileId: "id1", changeRequestId: "id2" });
			expect(await profile("id1")).toMatchObject({ status: "draft", userId: null });
			const req = await db.query.changeRequest.findFirst({ where: (f, o) => o.eq(f.id, "id2") });
			expect(req).toMatchObject({
				profileId: "id1",
				profileName: "Asha Patel",
				kind: "create",
				status: "pending",
				submitterUserId: "u-member",
				submitterName: "Mira Member",
				payload: null,
			});
			const evs = await events();
			expect(evs.map((e) => [e.action, e.changeRequestId, e.profileId])).toEqual([
				["change_request.submitted", "id2", "id1"],
			]);
			expect(evs[0]!.payload).toEqual({
				kind: "create",
				profile: expect.objectContaining({ id: "id1", firstName: "Asha", status: "draft" }),
			});
			expect(await version()).toBe(0);
		});

		it("self create → linked, active, profile.created", async () => {
			const res = await changes.submit(MEMBER, { kind: "create", self: true, profile: input() });

			expect(await profile(res.profileId)).toMatchObject({ status: "active", userId: "u-member" });
			expect((await events()).map((e) => e.action)).toEqual(["profile.created"]);
		});

		it("second self create → Conflict", async () => {
			await seed({ id: "mine", userId: "u-member" });
			await expectError(
				changes.submit(MEMBER, { kind: "create", self: true, profile: input() }),
				"Conflict"
			);
		});

		it("Member limit checked first; nothing written when reached", async () => {
			assertProfileSlot.mockRejectedValueOnce(new LimitError("profile"));
			await expectError(
				changes.submit(ADMIN, { kind: "create", profile: input() }),
				"LimitReached"
			);
			expect(await db.select().from(communityProfile)).toEqual([]);
			expect(await events()).toEqual([]);
		});
	});

	describe("create request: review / withdraw", () => {
		const request = (id: string) =>
			db.query.changeRequest.findFirst({ where: (f, o) => o.eq(f.id, id) });
		const memberDraft = async () => {
			const res = await changes.submit(MEMBER, { kind: "create", profile: input() });
			if (res.outcome !== "requested") throw new Error("expected requested");
			return res;
		};

		it("approve → active + change_request.approved (note) + profile.activated, graph changed", async () => {
			const { profileId, changeRequestId } = await memberDraft();

			await changes.review(ADMIN, changeRequestId, { decision: "approve", note: "Welcome" });

			expect(await profile(profileId)).toMatchObject({ status: "active", version: 1 });
			expect(await request(changeRequestId)).toMatchObject({
				status: "approved",
				resolvedByUserId: "u-admin",
				resolvedByName: "Adi Admin",
				resolutionNote: "Welcome",
			});
			const evs = (await events()).slice(1);
			expect(evs.map((e) => [e.action, e.changeRequestId, e.actorUserId])).toEqual([
				["change_request.approved", changeRequestId, "u-admin"],
				["profile.activated", changeRequestId, "u-admin"],
			]);
			expect(evs[0]!.payload).toEqual({ kind: "create", note: "Welcome" });
			expect(evs[1]!.payload).toEqual({ status: ["draft", "active"] });
			expect(await version()).toBe(1);
		});

		it("reject (reason required) → draft hard-deleted, rejected + profile.deleted snapshot", async () => {
			const { profileId, changeRequestId } = await memberDraft();
			await changes.submit(MEMBER, { kind: "address_add", profileId, address });

			await expectError(
				changes.review(ADMIN, changeRequestId, { decision: "reject", note: "  " }),
				"Invalid"
			);
			await changes.review(OWNER, changeRequestId, { decision: "reject", note: "Duplicate" });

			expect(await profile(profileId)).toBeUndefined();
			expect(await db.select().from(communityAddress)).toEqual([]);
			expect(await request(changeRequestId)).toMatchObject({
				status: "rejected",
				resolvedByUserId: "u-owner",
				resolutionNote: "Duplicate",
			});
			const evs = (await events()).slice(2);
			expect(evs.map((e) => [e.action, e.changeRequestId])).toEqual([
				["change_request.rejected", changeRequestId],
				["profile.deleted", changeRequestId],
			]);
			expect(evs[0]!.payload).toEqual({ kind: "create", reason: "Duplicate" });
			expect(evs[1]!.payload).toMatchObject({
				id: profileId,
				status: "draft",
				addresses: [expect.objectContaining({ city: "Surat" })],
			});
			// address_add on the creator's own draft applies directly (+1), the reject delete is +1
			expect(await version()).toBe(2);
		});

		it("withdraw (submitter only) → draft hard-deleted, withdrawn + profile.deleted", async () => {
			const { profileId, changeRequestId } = await memberDraft();

			await expectError(changes.withdraw(OTHER, changeRequestId), "NotFound");
			await expectError(changes.withdraw(ADMIN, changeRequestId), "NotFound");
			await changes.withdraw(MEMBER, changeRequestId);

			expect(await profile(profileId)).toBeUndefined();
			expect(await request(changeRequestId)).toMatchObject({
				status: "withdrawn",
				resolvedByUserId: "u-member",
				resolutionNote: null,
			});
			const evs = (await events()).slice(1);
			expect(evs.map((e) => [e.action, e.changeRequestId, e.actorUserId])).toEqual([
				["change_request.withdrawn", changeRequestId, "u-member"],
				["profile.deleted", changeRequestId, "u-member"],
			]);
			expect(evs[0]!.payload).toEqual({ kind: "create" });
		});

		it("double review / review after withdraw → Conflict; member cannot review", async () => {
			const a = await memberDraft();
			const b = await memberDraft();
			await expectError(
				changes.review(MEMBER, a.changeRequestId, { decision: "approve" }),
				"Forbidden"
			);
			await changes.review(ADMIN, a.changeRequestId, { decision: "approve" });
			await expectError(
				changes.review(OWNER, a.changeRequestId, { decision: "approve" }),
				"Conflict"
			);
			await changes.withdraw(MEMBER, b.changeRequestId);
			await expectError(
				changes.review(ADMIN, b.changeRequestId, { decision: "reject", note: "x" }),
				"Conflict"
			);
			await expectError(changes.withdraw(MEMBER, a.changeRequestId), "Conflict");
		});

		it("concurrent close between read and batch → Conflict, nothing applied", async () => {
			const { profileId, changeRequestId } = await memberDraft();
			const realBatch = db.batch.bind(db);
			db.batch = (async (items: never) => {
				fresh.sqlite.exec(
					`UPDATE changeRequest SET status = 'withdrawn' WHERE id = '${changeRequestId}'`
				);
				return realBatch(items);
			}) as typeof db.batch;

			await expectError(
				changes.review(ADMIN, changeRequestId, { decision: "approve" }),
				"Conflict"
			);
			expect((await profile(profileId))!.status).toBe("draft");
			expect((await events()).length).toBe(1);
		});

		it("backfilled request (null submitter) reviewable; nobody can withdraw it", async () => {
			await seed({ id: "old", status: "draft" });
			fresh.sqlite.exec(`
				INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
				VALUES ('bf', 'o1', 'old', 'OLD Doe', 'create', 'pending', NULL, 'Unknown', 0);
			`);
			await expectError(changes.withdraw(MEMBER, "bf"), "NotFound");
			await changes.review(ADMIN, "bf", { decision: "approve" });
			expect((await profile("old"))!.status).toBe("active");
		});

		it("owner delete of a draft supersedes its create request; reassign of a draft → Invalid", async () => {
			const { profileId, changeRequestId } = await memberDraft();
			await expectError(changes.reassign(ADMIN, profileId, "u-new"), "Invalid");
			expect((await request(changeRequestId))!.status).toBe("pending");

			await changes.remove(OWNER, profileId);
			expect((await request(changeRequestId))!.status).toBe("superseded");
			expect((await events()).slice(1).map((e) => e.action)).toEqual([
				"change_request.superseded",
				"profile.deleted",
			]);
		});

		it("Member limit slot freed after reject and withdraw", async () => {
			// Real-ish limit: at most 1 profile in the org.
			assertProfileSlot.mockImplementation(async () => {
				const rows = await db.select().from(communityProfile);
				if (rows.length >= 1) throw new LimitError("profile");
			});
			const first = await memberDraft();
			await expectError(memberDraft(), "LimitReached");
			await changes.review(ADMIN, first.changeRequestId, { decision: "reject", note: "No" });
			const second = await memberDraft();
			await expectError(memberDraft(), "LimitReached");
			await changes.withdraw(MEMBER, second.changeRequestId);
			await memberDraft();
		});
	});

	describe("submit info: routing", () => {
		const info = (profileId: string) => ({
			kind: "info" as const,
			profileId,
			expectedVersion: 0,
			profile: input({ firstName: "Changed" }),
		});

		beforeEach(async () => {
			await seed(
				{ id: "linked", userId: "u-member" },
				{ id: "active" },
				{ id: "draft", status: "draft" },
				{ id: "inactive", status: "inactive" }
			);
		});

		it("linked: its user applies directly", async () => {
			expect(await changes.submit(MEMBER, info("linked"))).toEqual({
				outcome: "applied",
				profileId: "linked",
				version: 1,
			});
		});

		it("linked: anyone else (even owner) → Forbidden", async () => {
			await expectError(changes.submit(OWNER, info("linked")), "Forbidden");
			await expectError(changes.submit(OTHER, info("linked")), "Forbidden");
		});

		for (const id of ["active", "draft", "inactive"]) {
			for (const who of [OWNER, ADMIN]) {
				it(`userless ${id}: ${who.role} applies directly`, async () => {
					expect((await changes.submit(who, info(id))).outcome).toBe("applied");
					expect(await profile(id)).toMatchObject({ firstName: "Changed", version: 1 });
				});
			}
		}

		it("userless active: member → requested (Change Request), not applied", async () => {
			expect((await changes.submit(MEMBER, info("active"))).outcome).toBe("requested");
			expect(await profile("active")).toMatchObject({ firstName: "ACTIVE", version: 0 });
		});

		it("userless draft: non-creator member → NotFound", async () => {
			await expectError(changes.submit(MEMBER, info("draft")), "NotFound");
		});

		it("userless draft: creator (submitter of pending create) applies directly", async () => {
			fresh.sqlite.exec(`
				INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
				VALUES ('cr1', 'o1', 'draft', 'D', 'create', 'pending', 'u-member', 'Mira', 0);
			`);
			expect((await changes.submit(MEMBER, info("draft"))).outcome).toBe("applied");
			await expectError(changes.submit(OTHER, info("draft")), "NotFound");
		});

		it("userless inactive: member → NotFound", async () => {
			await expectError(changes.submit(MEMBER, info("inactive")), "NotFound");
		});

		it("other org's profile → NotFound", async () => {
			fresh.sqlite.exec(
				`INSERT INTO organization (id, name, slug, created_at) VALUES ('o2', 'O2', 'o2', 0)`
			);
			await seed({ id: "foreign", organizationId: "o2" });
			await expectError(changes.submit(OWNER, info("foreign")), "NotFound");
		});
	});

	describe("submit info: diff + version", () => {
		beforeEach(async () => {
			fresh.sqlite.exec(
				`INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES ('f1', 'Gotra', 'text', 'o1')`
			);
			await db.insert(communityProfile).values({
				id: "p",
				organizationId: "o1",
				status: "active",
				...input({ customFieldData: { f1: "Old" } }),
			});
		});

		const info = (expectedVersion: number, over: Partial<CommunityProfileInput>) =>
			changes.submit(ADMIN, {
				kind: "info",
				profileId: "p",
				expectedVersion,
				profile: input({ customFieldData: { f1: "Old" }, ...over }),
			});

		it("profile.updated carries only changed fields as [before, after], CFVs with label", async () => {
			await info(0, { lastName: "Shah", customFieldData: { f1: "New" } });

			const [ev] = await events();
			expect(ev).toMatchObject({ action: "profile.updated", profileName: "Asha Shah" });
			expect(ev!.payload).toEqual({
				lastName: ["Patel", "Shah"],
				customFieldData: { f1: { label: "Gotra", change: ["Old", "New"] } },
			});
		});

		it("empty diff → unchanged, no event, no version bump", async () => {
			expect(await info(0, {})).toEqual({ outcome: "unchanged", profileId: "p" });
			expect(await events()).toEqual([]);
			expect((await profile("p"))!.version).toBe(0);
		});

		it("expectedVersion mismatch → Stale, nothing written", async () => {
			await info(0, { lastName: "Shah" });
			await expectError(info(0, { lastName: "Mehta" }), "Stale");
			expect((await profile("p"))!.lastName).toBe("Shah");
			expect(await events()).toHaveLength(1);
		});

		it("every applied info change bumps the org version, custom-field-only included", async () => {
			await info(0, { customFieldData: { f1: "New" } });
			expect(await version()).toBe(1);
			await info(1, { firstName: "Ashu" });
			expect(await version()).toBe(2);
		});
	});

	describe("guard trip", () => {
		it("rolls the whole batch back: no partial rows, no events", async () => {
			await seed({ id: "p" });
			// A concurrent write lands between the read and the batch.
			const realBatch = db.batch.bind(db);
			db.batch = (async (items: never) => {
				fresh.sqlite.exec(`UPDATE communityProfile SET version = 7 WHERE id = 'p'`);
				return realBatch(items);
			}) as typeof db.batch;

			await expectError(
				changes.submit(ADMIN, {
					kind: "info",
					profileId: "p",
					expectedVersion: 0,
					profile: input(),
				}),
				"Stale"
			);
			expect((await profile("p"))!.firstName).toBe("P");
			expect(await events()).toEqual([]);
			expect(await version()).toBe(0);
		});

		it("lifecycle guard trip → Conflict", async () => {
			await seed({ id: "p" });
			const realBatch = db.batch.bind(db);
			db.batch = (async (items: never) => {
				fresh.sqlite.exec(`UPDATE communityProfile SET status = 'inactive' WHERE id = 'p'`);
				return realBatch(items);
			}) as typeof db.batch;

			await expectError(changes.deactivate(ADMIN, "p"), "Conflict");
			expect(await events()).toEqual([]);
		});
	});

	describe("relations", () => {
		beforeEach(async () => {
			await seed(
				{ id: "a" },
				{ id: "b" },
				{ id: "c", status: "draft" },
				{ id: "mine", userId: "u-member" }
			);
		});

		const add = (who: Actor, profileId: string, toId: string) =>
			changes.submit(who, {
				kind: "relation_add",
				profileId,
				toId,
				type: "father",
				note: null,
				bloodRelation: true,
			});

		it("admin adds outgoing relation on Userless Profile → relation.added with counterpart", async () => {
			await add(ADMIN, "a", "b");

			const [rel] = await db.select().from(communityRelation);
			expect(rel).toMatchObject({ fromId: "a", toId: "b", type: "father" });
			const [ev] = await events();
			expect(ev).toMatchObject({
				action: "relation.added",
				profileId: "a",
				counterpartProfileId: "b",
				counterpartName: "B Doe",
				targetId: rel!.id,
			});
			expect(await version()).toBe(1);
		});

		it("self → Invalid; pair either direction → Invalid; non-active target → NotFound", async () => {
			await expectError(add(ADMIN, "a", "a"), "Invalid");
			await add(ADMIN, "a", "b");
			await expectError(add(ADMIN, "b", "a"), "Invalid");
			await expectError(add(ADMIN, "a", "c"), "NotFound");
		});

		it("linked user manages own; member on active Userless → requested", async () => {
			await add(MEMBER, "mine", "a");
			expect((await add(MEMBER, "a", "b")).outcome).toBe("requested");
		});

		it("remove: outgoing only, relation.removed snapshot", async () => {
			await add(ADMIN, "a", "b");
			const [rel] = await db.select().from(communityRelation);

			await expectError(
				changes.submit(ADMIN, { kind: "relation_remove", profileId: "b", relationId: rel!.id }),
				"NotFound"
			);
			await changes.submit(ADMIN, { kind: "relation_remove", profileId: "a", relationId: rel!.id });

			expect(await db.select().from(communityRelation)).toEqual([]);
			const ev = (await events()).at(-1)!;
			expect(ev).toMatchObject({ action: "relation.removed", counterpartProfileId: "b" });
			expect(ev.payload).toMatchObject({ fromId: "a", toId: "b", type: "father" });
			expect(await version()).toBe(2);
		});
	});

	describe("addresses", () => {
		beforeEach(async () => {
			await seed({ id: "a" }, { id: "mine", userId: "u-member" });
		});

		it("add / edit / remove emit address events; no graph change", async () => {
			await changes.submit(MEMBER, { kind: "address_add", profileId: "mine", address });
			const [row] = await db.select().from(communityAddress);
			await changes.submit(MEMBER, {
				kind: "address_edit",
				profileId: "mine",
				addressId: row!.id,
				expectedVersion: 0,
				address: { ...address, city: "Vadodara" },
			});
			expect((await db.select().from(communityAddress))[0]).toMatchObject({
				city: "Vadodara",
				version: 1,
			});
			await changes.submit(MEMBER, {
				kind: "address_remove",
				profileId: "mine",
				addressId: row!.id,
			});

			const evs = await events();
			expect(evs.map((e) => e.action)).toEqual([
				"address.added",
				"address.updated",
				"address.removed",
			]);
			expect(evs[1]!.payload).toEqual({ city: ["Surat", "Vadodara"] });
			expect(evs.every((e) => e.targetId === row!.id)).toBe(true);
			expect(await version()).toBe(3);
		});

		it("edit with stale version → Stale; empty edit → unchanged", async () => {
			await changes.submit(ADMIN, { kind: "address_add", profileId: "a", address });
			const [row] = await db.select().from(communityAddress);
			const edit = (expectedVersion: number, city: string) =>
				changes.submit(ADMIN, {
					kind: "address_edit",
					profileId: "a",
					addressId: row!.id,
					expectedVersion,
					address: { ...address, city },
				});
			expect((await edit(0, "Surat")).outcome).toBe("unchanged");
			await edit(0, "Vapi");
			await expectError(edit(0, "Navsari"), "Stale");
		});

		it("address of another profile → NotFound", async () => {
			await changes.submit(ADMIN, { kind: "address_add", profileId: "a", address });
			const [row] = await db.select().from(communityAddress);
			await expectError(
				changes.submit(MEMBER, { kind: "address_remove", profileId: "mine", addressId: row!.id }),
				"NotFound"
			);
		});

		it("member on active Userless → requested", async () => {
			expect(
				(await changes.submit(MEMBER, { kind: "address_add", profileId: "a", address })).outcome
			).toBe("requested");
		});
	});

	describe("lifecycle", () => {
		const pending = (id: string, profileId: string, kind = "info") =>
			fresh.sqlite.exec(`
				INSERT INTO changeRequest (id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
				VALUES ('${id}', 'o1', '${profileId}', 'X', '${kind}', 'pending', NULL, 'Unknown', 0);
			`);
		const requestStatus = async (id: string) =>
			(await db.query.changeRequest.findFirst({ where: (f, o) => o.eq(f.id, id) }))?.status;

		beforeEach(async () => {
			await seed({ id: "a" }, { id: "b" }, { id: "d", status: "draft" });
		});

		it("deactivate: supersedes pending requests, profile.deactivated, graph changed", async () => {
			pending("r1", "a");
			pending("r2", "a", "address_add");
			await changes.deactivate(ADMIN, "a");

			expect(await profile("a")).toMatchObject({ status: "inactive", version: 1 });
			expect(await requestStatus("r1")).toBe("superseded");
			expect(await requestStatus("r2")).toBe("superseded");
			const evs = await events();
			expect(evs.map((e) => [e.action, e.changeRequestId])).toEqual([
				["change_request.superseded", "r1"],
				["change_request.superseded", "r2"],
				["profile.deactivated", null],
			]);
			expect(await version()).toBe(1);
		});

		it("reactivate inactive → active; wrong status → Invalid; member → Forbidden", async () => {
			await expectError(changes.reactivate(ADMIN, "a"), "Invalid");
			await changes.deactivate(OWNER, "a");
			await expectError(changes.deactivate(MEMBER, "b"), "Forbidden");
			await changes.reactivate(OWNER, "a");
			expect((await profile("a"))!.status).toBe("active");
			expect((await events()).at(-1)!.action).toBe("profile.reactivated");
		});

		it("reassign: links active Userless Profile, supersedes, profile.reassigned snapshot", async () => {
			pending("r1", "a");
			await changes.reassign(ADMIN, "a", "u-new");

			expect(await profile("a")).toMatchObject({ userId: "u-new", version: 1 });
			expect(await requestStatus("r1")).toBe("superseded");
			const ev = (await events()).at(-1)!;
			expect(ev.action).toBe("profile.reassigned");
			expect(ev.payload).toEqual({ userId: "u-new", name: "Nia New", email: "n@x.test" });
			expect(await version()).toBe(1);
		});

		it("reassign rejects: draft, self, non-member, plain member, user already linked", async () => {
			await expectError(changes.reassign(ADMIN, "d", "u-new"), "Invalid");
			await expectError(changes.reassign(ADMIN, "a", "u-admin"), "Invalid");
			await expectError(changes.reassign(ADMIN, "a", "nobody"), "NotFound");
			await expectError(changes.reassign(MEMBER, "a", "u-new"), "Forbidden");
			await seed({ id: "taken", userId: "u-other" });
			await expectError(changes.reassign(ADMIN, "a", "u-other"), "Invalid");
		});

		it("remove: owner only; snapshot incl. addresses; relation.removed per cascaded relation", async () => {
			await changes.submit(ADMIN, { kind: "address_add", profileId: "a", address });
			await changes.submit(ADMIN, {
				kind: "relation_add",
				profileId: "a",
				toId: "b",
				type: "father",
				note: null,
				bloodRelation: false,
			});
			// Incoming relation from a draft (cascade must catch both directions).
			fresh.sqlite.exec(
				`INSERT INTO communityRelation (id, fromId, toId, organizationId, type) VALUES ('in1', 'd', 'a', 'o1', 'child')`
			);
			pending("r1", "a");
			const before = await version();

			await expectError(changes.remove(ADMIN, "a"), "Forbidden");
			await changes.remove(OWNER, "a");

			expect(await profile("a")).toBeUndefined();
			expect(await db.select().from(communityAddress)).toEqual([]);
			expect(await db.select().from(communityRelation)).toEqual([]);
			expect(await requestStatus("r1")).toBe("superseded");

			const evs = (await events()).slice(2);
			expect(evs.map((e) => [e.action, e.counterpartProfileId])).toEqual([
				["change_request.superseded", null],
				["profile.deleted", null],
				["relation.removed", "b"],
				["relation.removed", "d"],
			]);
			expect(evs[1]!.payload).toMatchObject({
				id: "a",
				firstName: "A",
				addresses: [expect.objectContaining({ city: "Surat" })],
			});
			expect(await version()).toBe(before + 1);
		});

		it("remove a draft: applied, bumps too", async () => {
			await changes.remove(OWNER, "d");
			expect(await profile("d")).toBeUndefined();
			expect(await version()).toBe(1);
		});
	});
});
