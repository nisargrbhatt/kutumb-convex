import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { listPendingByProfile, listMyRequests } from "@/domain/queries/changeRequests";
import { listAuditGroups } from "@/domain/queries/audit";
import type { Actor } from "@/domain/permission";
import { AppError } from "@/domain/errors";
import { LIMIT_ERROR_CODES, PENDING_REQUEST_LIMIT } from "@/domain/limits";
import {
	ADMIN,
	MEMBER,
	OWNER,
	address,
	input,
	profileChangesHarness,
} from "@/test/profileChangesHarness";

const actorOf = (userId: string): Actor => ({ userId, organizationId: "o1", role: "member" });

const VIA = { clientId: "c1", clientName: "Claude" };

describe("AI attribution", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "p" });
	});

	it("direct change through a Connection stamps via on its events", async () => {
		await h.changesVia(VIA).submit(ADMIN, { kind: "create", profile: input() });

		expect(await h.events()).toMatchObject([
			{
				action: "profile.created",
				actorUserId: "u-admin",
				viaClientId: "c1",
				viaClientName: "Claude",
			},
		]);
	});

	it("member's request through a Connection stamps via on the request and its submitted event", async () => {
		const res = await h.changesVia(VIA).submit(MEMBER, {
			kind: "info",
			profileId: "p",
			expectedVersion: 0,
			profile: input({ firstName: "P", lastName: "Doe", nickName: "Pi" }),
		});
		if (res.outcome !== "requested") throw new Error(`got ${res.outcome}`);

		expect(await h.request(res.changeRequestId)).toMatchObject({
			submitterUserId: "u-member",
			viaClientId: "c1",
			viaClientName: "Claude",
		});
		expect(await h.events()).toMatchObject([
			{ action: "change_request.submitted", viaClientId: "c1", viaClientName: "Claude" },
		]);
	});

	it("member's draft create through a Connection stamps the pending create request", async () => {
		const res = await h.changesVia(VIA).submit(MEMBER, { kind: "create", profile: input() });
		if (res.outcome !== "requested") throw new Error(`got ${res.outcome}`);

		expect(await h.request(res.changeRequestId)).toMatchObject({
			kind: "create",
			viaClientId: "c1",
			viaClientName: "Claude",
		});
	});

	it("in-app request leaves via null", async () => {
		const res = await h.changes.submit(MEMBER, { kind: "create", profile: input() });
		if (res.outcome !== "requested") throw new Error(`got ${res.outcome}`);

		expect(await h.request(res.changeRequestId)).toMatchObject({
			viaClientId: null,
			viaClientName: null,
		});
	});

	it("Review of an attributed request stays unattributed, even on a Connection seam", async () => {
		const res = await h.changesVia(VIA).submit(MEMBER, {
			kind: "info",
			profileId: "p",
			expectedVersion: 0,
			profile: input({ firstName: "P", lastName: "Doe", nickName: "Pi" }),
		});
		if (res.outcome !== "requested") throw new Error(`got ${res.outcome}`);

		await h.changesVia(VIA).review(OWNER, res.changeRequestId, { decision: "approve" });

		const events = await h.events();
		expect(events.map((e) => e.action)).toEqual([
			"change_request.submitted",
			"change_request.approved",
			"profile.updated",
		]);
		expect(events.slice(1)).toMatchObject([
			{ viaClientId: null, viaClientName: null },
			{ viaClientId: null, viaClientName: null },
		]);
	});

	it("in-app change leaves via null", async () => {
		await h.changes.submit(ADMIN, { kind: "create", profile: input() });

		expect(await h.events()).toMatchObject([{ viaClientId: null, viaClientName: null }]);
	});
});

describe("attributed rows surface in the read paths (dev fixture)", () => {
	it("Reviews queue, My requests and the audit log carry the client name", async () => {
		const h = profileChangesHarness();
		await h.seed({ id: "p" });
		h.fresh.sqlite.exec(
			readFileSync(".scratch/mcp-v2/fixtures/18-attributed-rows.sql", "utf8")
				.split("--> statement-breakpoint")
				.join("")
		);

		const [group] = await listPendingByProfile(h.db, OWNER);
		expect(group?.requests[0]).toMatchObject({ id: "fixture-18-req", viaClientName: "Claude" });

		const mine = await listMyRequests(h.db, actorOf(group!.requests[0]!.submitterUserId!));
		expect(mine[0]).toMatchObject({ id: "fixture-18-req", viaClientName: "Claude" });

		const { groups } = await listAuditGroups(h.db, OWNER, {});
		expect(groups[0]?.events[0]).toMatchObject({
			viaClientId: "fixture-client",
			viaClientName: "Claude",
		});
	});
});

describe("SubmitResult ids and version", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "p" }, { id: "q" });
	});

	it("create → new profile id, version 0", async () => {
		const res = await h.changes.submit(OWNER, { kind: "create", profile: input() });

		expect(res).toEqual({ outcome: "applied", profileId: expect.any(String), version: 0 });
		expect((await h.profile((res as { profileId: string }).profileId))?.version).toBe(0);
	});

	it("info → profile's new version", async () => {
		const res = await h.changes.submit(OWNER, {
			kind: "info",
			profileId: "p",
			expectedVersion: 0,
			profile: input({ firstName: "P", lastName: "Doe", nickName: "Pi" }),
		});

		expect(res).toEqual({ outcome: "applied", profileId: "p", version: 1 });
		expect((await h.profile("p"))?.version).toBe(1);
	});

	it("address_add → addressId + version 0; address_edit → bumped version", async () => {
		const added = await h.changes.submit(OWNER, { kind: "address_add", profileId: "p", address });
		if (added.outcome !== "applied" || !added.addressId) throw new Error("no addressId");
		expect(added).toMatchObject({ profileId: "p", version: 0 });

		const edited = await h.changes.submit(OWNER, {
			kind: "address_edit",
			profileId: "p",
			addressId: added.addressId,
			expectedVersion: 0,
			address: { ...address, city: "Vadodara" },
		});
		expect(edited).toEqual({
			outcome: "applied",
			profileId: "p",
			addressId: added.addressId,
			version: 1,
		});
	});

	it("relation_add → relationId; relation_remove echoes it", async () => {
		const added = await h.changes.submit(OWNER, {
			kind: "relation_add",
			profileId: "p",
			toId: "q",
			type: "father",
			note: null,
			bloodRelation: true,
		});
		if (added.outcome !== "applied" || !added.relationId) throw new Error("no relationId");
		expect(added.profileId).toBe("p");

		const removed = await h.changes.submit(OWNER, {
			kind: "relation_remove",
			profileId: "p",
			relationId: added.relationId,
		});
		expect(removed).toMatchObject({ outcome: "applied", relationId: added.relationId });
	});

	it("requested carries the request id, no target version", async () => {
		const res = await h.changes.submit(MEMBER, { kind: "address_add", profileId: "p", address });

		expect(res).toEqual({
			outcome: "requested",
			profileId: "p",
			changeRequestId: expect.any(String),
		});
	});
});

describe("pending request limit", () => {
	let h: ReturnType<typeof profileChangesHarness>;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed({ id: "p" });
	});

	/** `n` requests straight into the table (a multi-row insert would trip D1's bound-param cap). */
	const fill = (n: number, over: { submitter?: string; status?: string } = {}) => {
		const { submitter = "u-member", status = "pending" } = over;
		h.fresh.sqlite.exec(`
			WITH RECURSIVE seq(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM seq WHERE i < ${n})
			INSERT INTO changeRequest
				(id, organizationId, profileId, profileName, kind, status, submitterUserId, submitterName, createdAt)
			SELECT 'fill-${submitter}-${status}-' || i, 'o1', 'p', 'P Doe', 'info', '${status}', '${submitter}', 'x', 1 FROM seq
		`);
	};

	const addAddress = (actor = MEMBER) =>
		h.changes.submit(actor, { kind: "address_add", profileId: "p", address });

	it("one below the limit → the request is filed", async () => {
		fill(PENDING_REQUEST_LIMIT - 1);

		expect((await addAddress()).outcome).toBe("requested");
	});

	it("at the limit a member's request fails LimitReached and writes nothing", async () => {
		fill(PENDING_REQUEST_LIMIT);

		const e = await addAddress().then(
			() => null,
			(err: unknown) => err
		);
		expect(e).toBeInstanceOf(AppError);
		expect(e).toMatchObject({ kind: "LimitReached", code: LIMIT_ERROR_CODES.pendingRequest });
		expect(await h.events()).toEqual([]);
	});

	it("also blocks a member's draft create", async () => {
		fill(PENDING_REQUEST_LIMIT);

		await expect(
			h.changes.submit(MEMBER, { kind: "create", profile: input() })
		).rejects.toMatchObject({ kind: "LimitReached", code: LIMIT_ERROR_CODES.pendingRequest });
	});

	it("counts only this submitter's pending requests", async () => {
		fill(PENDING_REQUEST_LIMIT, { submitter: "u-other" });
		fill(PENDING_REQUEST_LIMIT, { status: "rejected" });

		expect((await addAddress()).outcome).toBe("requested");
	});

	it("does not limit direct changes by owner/admin", async () => {
		fill(PENDING_REQUEST_LIMIT, { submitter: "u-admin" });

		expect((await addAddress(ADMIN)).outcome).toBe("applied");
	});
});
