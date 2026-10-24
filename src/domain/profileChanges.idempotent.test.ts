import { beforeEach, describe, expect, it } from "vitest";
import { LimitError, PENDING_REQUEST_LIMIT } from "@/domain/limits";
import type { ProfileChange } from "@/domain/profileChanges";
import {
	ADMIN,
	MEMBER,
	OTHER,
	address,
	input,
	profileChangesHarness,
} from "@/test/profileChangesHarness";

/** An exact repeat of a member's own pending request is `unchanged` + the existing request id. */
describe("repeating a pending Change Request", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "p", ...input() }, { id: "q" });
	});

	const requests = () => h.db.query.changeRequest.findMany();

	const info = (lastName: string): ProfileChange => ({
		kind: "info",
		profileId: "p",
		expectedVersion: 0,
		profile: input({ lastName }),
	});
	const relation = (type: "father" | "mother" = "father"): ProfileChange => ({
		kind: "relation_add",
		profileId: "p",
		toId: "q",
		type,
		note: null,
		bloodRelation: true,
	});
	const addressAdd = (city = address.city): ProfileChange => ({
		kind: "address_add",
		profileId: "p",
		address: { ...address, city },
	});

	it.each([
		["info", () => info("Shah"), () => info("Mehta")],
		["relation_add", () => relation("father"), () => relation("mother")],
		["address_add", () => addressAdd("Surat"), () => addressAdd("Vapi")],
	])(
		"%s: same payload → unchanged + the existing id; a different payload files a new one",
		async (_k, same, other) => {
			const first = await h.changes.submit(MEMBER, same());
			if (first.outcome !== "requested") throw new Error(first.outcome);

			expect(await h.changes.submit(MEMBER, same())).toEqual({
				outcome: "unchanged",
				profileId: "p",
				changeRequestId: first.changeRequestId,
			});
			expect(await requests()).toHaveLength(1);
			expect((await h.events()).map((e) => e.action)).toEqual(["change_request.submitted"]);

			expect((await h.changes.submit(MEMBER, other())).outcome).toBe("requested");
			expect(await requests()).toHaveLength(2);
		}
	);

	it("address_edit: same patch twice → unchanged", async () => {
		await h.changes.submit(ADMIN, { kind: "address_add", profileId: "p", address });
		const [row] = await h.db.query.communityAddress.findMany();
		const edit: ProfileChange = {
			kind: "address_edit",
			profileId: "p",
			addressId: row!.id,
			expectedVersion: 0,
			address: { ...address, city: "Vapi" },
		};
		const first = await h.changes.submit(MEMBER, edit);
		expect(await h.changes.submit(MEMBER, edit)).toMatchObject({
			outcome: "unchanged",
			changeRequestId: first.outcome === "requested" ? first.changeRequestId : "?",
		});
		expect(await requests()).toHaveLength(1);
	});

	it("only the submitter's own pending request counts", async () => {
		await h.changes.submit(MEMBER, info("Shah"));

		expect((await h.changes.submit(OTHER, info("Shah"))).outcome).toBe("requested");
		expect(await requests()).toHaveLength(2);
	});

	it("once the request is resolved, the same change files a new one", async () => {
		const first = await h.changes.submit(MEMBER, addressAdd());
		if (first.outcome !== "requested") throw new Error(first.outcome);
		await h.changes.review(ADMIN, first.changeRequestId, { decision: "reject", note: "no" });

		expect((await h.changes.submit(MEMBER, addressAdd())).outcome).toBe("requested");
	});

	it("a repeat is not blocked by the pending-request limit", async () => {
		const first = await h.changes.submit(MEMBER, addressAdd());
		if (first.outcome !== "requested") throw new Error(first.outcome);
		h.fresh.sqlite.exec(`
			WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ${PENDING_REQUEST_LIMIT})
			INSERT INTO changeRequest
				(id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
			SELECT 'fill-' || i, 'o1', 'p', 'P Doe', 'info', 'pending', 'u-member', 'x', 1 FROM seq
		`);

		expect(await h.changes.submit(MEMBER, addressAdd())).toMatchObject({ outcome: "unchanged" });
		await expect(h.changes.submit(MEMBER, addressAdd("Vapi"))).rejects.toBeInstanceOf(LimitError);
	});
});
