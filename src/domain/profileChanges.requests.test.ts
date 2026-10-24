import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors";
import {
	ADMIN,
	MEMBER,
	OTHER,
	OWNER,
	address,
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

const requested = (res: { outcome: string; changeRequestId?: string }) => {
	if (res.outcome !== "requested" || !res.changeRequestId) throw new Error(`got ${res.outcome}`);
	return res.changeRequestId;
};

describe("member Change Requests on an active Userless Profile", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		h.fresh.sqlite.exec(
			`INSERT INTO communityProfileCustomField (id, label, type, organizationId) VALUES ('f1', 'Gotra', 'text', 'o1')`
		);
		await h.seed({ id: "p", ...input({ customFieldData: { f1: "Old" } }) }, { id: "q" });
	});

	const info = (over: Parameters<typeof input>[0], expectedVersion = 0) =>
		h.changes.submit(MEMBER, {
			kind: "info",
			profileId: "p",
			expectedVersion,
			profile: input({ customFieldData: { f1: "Old" }, ...over }),
		});

	describe("info", () => {
		it("submit → pending request with {field: [base, proposed]} + submitted; nothing applied", async () => {
			const id = requested(await info({ lastName: "Shah", customFieldData: { f1: "New" } }));

			const diff = {
				lastName: ["Patel", "Shah"],
				customFieldData: { f1: { label: "Gotra", change: ["Old", "New"] } },
			};
			expect(await h.request(id)).toMatchObject({
				profileId: "p",
				profileName: "Asha Patel",
				kind: "info",
				status: "pending",
				targetId: null,
				submitterUserId: "u-member",
				submitterName: "Mira Member",
				payload: diff,
			});
			expect(await h.profile("p")).toMatchObject({ lastName: "Patel", version: 0 });
			const [ev] = await h.events();
			expect(ev).toMatchObject({
				action: "change_request.submitted",
				actorUserId: "u-member",
				changeRequestId: id,
				profileId: "p",
			});
			expect(ev!.payload).toEqual({ kind: "info", payload: diff });
			expect(await h.version()).toBe(0);
		});

		it("approve → applied, approved (note) + profile.updated linked to request, Actor = reviewer", async () => {
			const id = requested(await info({ lastName: "Shah" }));

			expect(await h.changes.review(ADMIN, id, { decision: "approve", note: "ok" })).toEqual({
				kind: "info",
				profileId: "p",
			});

			expect(await h.profile("p")).toMatchObject({ lastName: "Shah", version: 1 });
			expect(await h.request(id)).toMatchObject({
				status: "approved",
				resolvedByUserId: "u-admin",
				resolvedByName: "Adi Admin",
				resolutionNote: "ok",
			});
			const evs = (await h.events()).slice(1);
			expect(evs.map((e) => [e.action, e.actorUserId, e.changeRequestId])).toEqual([
				["change_request.approved", "u-admin", id],
				["profile.updated", "u-admin", id],
			]);
			expect(evs[1]!.payload).toEqual({ lastName: ["Patel", "Shah"] });
			expect(evs[1]!.profileName).toBe("Asha Shah");
			expect(await h.version()).toBe(1);
		});

		it("two requests patching one field: approving one makes the other Stale; reject still allowed", async () => {
			const a = requested(await info({ lastName: "Shah" }));
			const b = requested(await info({ lastName: "Mehta", nickName: "Ash" }));
			await h.changes.review(ADMIN, a, { decision: "approve" });

			await expectError(h.changes.review(ADMIN, b, { decision: "approve" }), "Stale");
			expect(await h.request(b)).toMatchObject({ status: "pending" });
			expect(await h.profile("p")).toMatchObject({ lastName: "Shah", nickName: null });

			await h.changes.review(OWNER, b, { decision: "reject", note: "Outdated" });
			expect(await h.request(b)).toMatchObject({ status: "rejected", resolutionNote: "Outdated" });
			expect((await h.events()).at(-1)).toMatchObject({
				action: "change_request.rejected",
				changeRequestId: b,
				payload: { kind: "info", reason: "Outdated" },
			});
		});

		it("unrelated field changed since submit → still approvable; untouched fields kept", async () => {
			const a = requested(await info({ customFieldData: { f1: "New" } }));
			await h.changes.submit(ADMIN, {
				kind: "info",
				profileId: "p",
				expectedVersion: 0,
				profile: input({ customFieldData: { f1: "Old" }, nickName: "Ash" }),
			});

			await h.changes.review(ADMIN, a, { decision: "approve" });
			expect(await h.profile("p")).toMatchObject({
				nickName: "Ash",
				customFieldData: { f1: "New" },
				version: 2,
			});
		});

		it("submit with old expectedVersion → Stale; empty diff → unchanged, no request", async () => {
			await h.changes.submit(ADMIN, {
				kind: "info",
				profileId: "p",
				expectedVersion: 0,
				profile: input({ customFieldData: { f1: "Old" }, nickName: "Ash" }),
			});
			await expectError(info({ lastName: "Shah" }, 0), "Stale");
			expect(await info({ nickName: "Ash" }, 1)).toEqual({ outcome: "unchanged", profileId: "p" });
			expect(await h.db.query.changeRequest.findMany()).toEqual([]);
		});

		it("guard trip mid-approve: patched field changed → Stale; other field → Conflict; closed → Conflict", async () => {
			const a = requested(await info({ lastName: "Shah" }));

			h.beforeNextBatch(
				`UPDATE communityProfile SET lastName = 'Joshi', version = 1 WHERE id = 'p'`
			);
			await expectError(h.changes.review(ADMIN, a, { decision: "approve" }), "Stale");

			h.fresh.sqlite.exec(`UPDATE communityProfile SET lastName = 'Patel' WHERE id = 'p'`);
			h.beforeNextBatch(`UPDATE communityProfile SET nickName = 'X', version = 2 WHERE id = 'p'`);
			await expectError(h.changes.review(ADMIN, a, { decision: "approve" }), "Conflict");

			h.beforeNextBatch(`UPDATE changeRequest SET status = 'withdrawn' WHERE id = '${a}'`);
			await expectError(h.changes.review(ADMIN, a, { decision: "approve" }), "Conflict");

			expect(await h.profile("p")).toMatchObject({ lastName: "Patel" });
			expect((await h.events()).map((e) => e.action)).toEqual(["change_request.submitted"]);
		});
	});

	describe("relations (outgoing only)", () => {
		const addRel = (toId: string, who = MEMBER) =>
			h.changes.submit(who, {
				kind: "relation_add",
				profileId: "p",
				toId,
				type: "father",
				note: "n",
				bloodRelation: true,
			});

		it("relation_add: submit → payload + counterpart on event; approve → relation.added", async () => {
			const id = requested(await addRel("q"));
			expect(await h.request(id)).toMatchObject({
				kind: "relation_add",
				targetId: null,
				payload: { toId: "q", toName: "Q Doe", type: "father", note: "n", bloodRelation: true },
			});
			expect(await h.db.query.communityRelation.findMany()).toEqual([]);
			expect((await h.events())[0]).toMatchObject({
				action: "change_request.submitted",
				counterpartProfileId: "q",
				counterpartName: "Q Doe",
			});

			await h.changes.review(ADMIN, id, { decision: "approve" });
			const [rel] = await h.db.query.communityRelation.findMany();
			expect(rel).toMatchObject({ fromId: "p", toId: "q", type: "father", bloodRelation: true });
			expect((await h.events()).slice(1).map((e) => [e.action, e.changeRequestId])).toEqual([
				["change_request.approved", id],
				["relation.added", id],
			]);
			expect(await h.version()).toBe(1);
		});

		it("relation_add stale: counterpart not active; pair related either direction", async () => {
			await h.seed({ id: "r" });
			const toQ = requested(await addRel("q"));
			const toR = requested(await addRel("r"));
			await h.changes.deactivate(ADMIN, "q");
			await expectError(h.changes.review(ADMIN, toQ, { decision: "approve" }), "Stale");

			await h.changes.submit(ADMIN, {
				kind: "relation_add",
				profileId: "r",
				toId: "p",
				type: "child",
				note: null,
				bloodRelation: true,
			});
			await expectError(h.changes.review(ADMIN, toR, { decision: "approve" }), "Stale");
		});

		it("relation_add submit validates like direct: self / related → Invalid; non-active → NotFound", async () => {
			await h.seed({ id: "d", status: "draft" });
			await expectError(addRel("p"), "Invalid");
			await expectError(addRel("d"), "NotFound");
			await h.changes.submit(ADMIN, {
				kind: "relation_add",
				profileId: "q",
				toId: "p",
				type: "child",
				note: null,
				bloodRelation: true,
			});
			await expectError(addRel("q"), "Invalid");
		});

		it("relation_remove: outgoing only; snapshot payload; approve removes; gone → Stale", async () => {
			await addRel("q", ADMIN);
			const [rel] = await h.db.query.communityRelation.findMany();
			const remove = (who = MEMBER) =>
				h.changes.submit(who, { kind: "relation_remove", profileId: "p", relationId: rel!.id });
			await expectError(
				h.changes.submit(MEMBER, { kind: "relation_remove", profileId: "q", relationId: rel!.id }),
				"NotFound"
			);
			const a = requested(await remove());
			const b = requested(await remove(OTHER));
			expect(await h.request(a)).toMatchObject({
				targetId: rel!.id,
				payload: { id: rel!.id, fromId: "p", toId: "q", toName: "Q Doe", type: "father" },
			});

			await h.changes.review(ADMIN, a, { decision: "approve" });
			expect(await h.db.query.communityRelation.findMany()).toEqual([]);
			expect((await h.events()).at(-1)).toMatchObject({
				action: "relation.removed",
				changeRequestId: a,
			});
			await expectError(h.changes.review(ADMIN, b, { decision: "approve" }), "Stale");
		});
	});

	describe("addresses", () => {
		const addressRow = async () => (await h.db.query.communityAddress.findMany())[0]!;

		it("address_add: never stale; approve → address.added", async () => {
			const id = requested(
				await h.changes.submit(MEMBER, { kind: "address_add", profileId: "p", address })
			);
			expect(await h.request(id)).toMatchObject({ targetId: null, payload: address });
			expect(await h.db.query.communityAddress.findMany()).toEqual([]);

			await h.changes.review(ADMIN, id, { decision: "approve" });
			expect(await addressRow()).toMatchObject({ communityProfileId: "p", city: "Surat" });
			expect((await h.events()).at(-1)).toMatchObject({
				action: "address.added",
				changeRequestId: id,
			});
			expect(await h.version()).toBe(1);
		});

		it("address_edit: diff payload; approve applies onto current; patched field changed or gone → Stale", async () => {
			await h.changes.submit(ADMIN, { kind: "address_add", profileId: "p", address });
			const row = await addressRow();
			const edit = (over: Partial<typeof address>) =>
				h.changes.submit(MEMBER, {
					kind: "address_edit",
					profileId: "p",
					addressId: row.id,
					expectedVersion: 0,
					address: { ...address, ...over },
				});
			const city = requested(await edit({ city: "Vapi" }));
			const note = requested(await edit({ note: "gate 2" }));
			const city2 = requested(await edit({ city: "Navsari" }));
			expect(await h.request(city)).toMatchObject({
				targetId: row.id,
				payload: { city: ["Surat", "Vapi"] },
			});

			await h.changes.review(ADMIN, city, { decision: "approve" });
			await h.changes.review(ADMIN, note, { decision: "approve" });
			expect(await addressRow()).toMatchObject({ city: "Vapi", note: "gate 2", version: 2 });
			expect((await h.events()).at(-1)).toMatchObject({
				action: "address.updated",
				changeRequestId: note,
				payload: { note: [null, "gate 2"] },
			});
			await expectError(h.changes.review(ADMIN, city2, { decision: "approve" }), "Stale");

			const gone = requested(
				await h.changes.submit(MEMBER, {
					kind: "address_edit",
					profileId: "p",
					addressId: row.id,
					expectedVersion: 2,
					address: { ...address, city: "Vapi", note: "gate 2", line1: "2 Main St" },
				})
			);
			await h.changes.submit(ADMIN, { kind: "address_remove", profileId: "p", addressId: row.id });
			await expectError(h.changes.review(ADMIN, gone, { decision: "approve" }), "Stale");
		});

		it("address_remove: snapshot; approve removes; second remove → Stale (gone)", async () => {
			await h.changes.submit(ADMIN, { kind: "address_add", profileId: "p", address });
			const row = await addressRow();
			const remove = (who = MEMBER) =>
				h.changes.submit(who, { kind: "address_remove", profileId: "p", addressId: row.id });
			const a = requested(await remove());
			const b = requested(await remove(OTHER));
			expect(await h.request(a)).toMatchObject({
				targetId: row.id,
				payload: { id: row.id, city: "Surat" },
			});
			await h.changes.review(ADMIN, a, { decision: "approve" });
			expect(await h.db.query.communityAddress.findMany()).toEqual([]);
			await expectError(h.changes.review(ADMIN, b, { decision: "approve" }), "Stale");
		});
	});

	describe("withdraw / supersede / routing", () => {
		it("withdraw: submitter only; nothing applied; then approve → Conflict", async () => {
			const id = requested(await info({ lastName: "Shah" }));
			await expectError(h.changes.withdraw(OTHER, id), "NotFound");
			await expectError(h.changes.withdraw(ADMIN, id), "NotFound");
			expect(await h.changes.withdraw(MEMBER, id)).toEqual({ kind: "info", profileId: "p" });

			expect(await h.request(id)).toMatchObject({
				status: "withdrawn",
				resolvedByUserId: "u-member",
			});
			expect(await h.profile("p")).toMatchObject({ lastName: "Patel" });
			expect((await h.events()).at(-1)).toMatchObject({
				action: "change_request.withdrawn",
				payload: { kind: "info" },
			});
			await expectError(h.changes.review(ADMIN, id, { decision: "approve" }), "Conflict");
		});

		it("deactivate / delete supersede every pending request of the profile", async () => {
			const a = requested(await info({ lastName: "Shah" }));
			const b = requested(
				await h.changes.submit(MEMBER, { kind: "address_add", profileId: "p", address })
			);
			await h.changes.deactivate(ADMIN, "p");
			expect((await h.request(a))!.status).toBe("superseded");
			expect((await h.request(b))!.status).toBe("superseded");

			await h.changes.reactivate(ADMIN, "p");
			const c = requested(await info({ lastName: "Shah" }, 2));
			await h.changes.remove(OWNER, "p");
			expect((await h.request(c))!.status).toBe("superseded");
		});

		it("many pending per profile allowed; inactive → NotFound for member; own linked stays direct", async () => {
			requested(await info({ lastName: "Shah" }));
			requested(await info({ lastName: "Mehta" }));
			await h.seed({ id: "mine", userId: "u-member" }, { id: "gone", status: "inactive" });
			expect(
				(await h.changes.submit(MEMBER, { kind: "address_add", profileId: "mine", address }))
					.outcome
			).toBe("applied");
			await expectError(
				h.changes.submit(MEMBER, { kind: "address_add", profileId: "gone", address }),
				"NotFound"
			);
		});
	});
});
