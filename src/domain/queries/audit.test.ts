import { beforeEach, describe, expect, it } from "vitest";
import { auditEvent } from "@/db/schema";
import type { AuditAction } from "@/db/constants";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { eq } from "drizzle-orm";
import { listAuditFacets, listAuditGroups } from "./audit";

const OWNER: Actor = { userId: "u-owner", organizationId: "o1", role: "owner" };

type Ev = {
	id: string;
	at: number;
	action?: AuditAction;
	profileId?: string;
	cr?: string;
	counterpart?: string;
	actor?: string;
	org?: string;
};

describe("listAuditGroups", () => {
	let db: ReturnType<typeof freshDb>["db"];

	const seed = (events: Ev[]) =>
		db.insert(auditEvent).values(
			events.map((e) => ({
				id: e.id,
				organizationId: e.org ?? "o1",
				action: e.action ?? "profile.updated",
				createdAt: new Date(e.at),
				actorUserId: e.actor ?? "u-owner",
				actorName: "Owner",
				actorRole: "owner",
				profileId: e.profileId ?? "p1",
				profileName: "P",
				counterpartProfileId: e.counterpart ?? null,
				counterpartName: e.counterpart ? "C" : null,
				changeRequestId: e.cr ?? null,
				payload: null,
			}))
		);

	const keys = (r: Awaited<ReturnType<typeof listAuditGroups>>) => r.groups.map((g) => g.key);

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		fresh.sqlite.exec(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ('o1','Org 1','o1',0), ('o2','Org 2','o2',0)`
		);
	});

	it("lists unlinked events as their own groups, newest first, org-scoped", async () => {
		await seed([
			{ id: "e1", at: 1 },
			{ id: "e2", at: 2 },
			{ id: "x", at: 3, org: "o2" },
		]);
		const r = await listAuditGroups(db, OWNER, {});
		expect(keys(r)).toEqual(["e2", "e1"]);
		expect(r.groups[0].events.map((e) => e.id)).toEqual(["e2"]);
		expect(r.nextCursor).toBeNull();
	});

	it("keeps a Change Request spanning days as one group, ordered by its latest event", async () => {
		const DAY = 86_400_000;
		await seed([
			{ id: "s", at: 1 * DAY, action: "change_request.submitted", cr: "cr1" },
			{ id: "u1", at: 2 * DAY },
			{ id: "u2", at: 3 * DAY },
			{ id: "a", at: 4 * DAY, action: "change_request.approved", cr: "cr1" },
			{ id: "ap", at: 4 * DAY, action: "profile.updated", cr: "cr1" },
			{ id: "u3", at: 5 * DAY },
		]);
		const r = await listAuditGroups(db, OWNER, {});
		expect(keys(r)).toEqual(["u3", "cr1", "u2", "u1"]);
		expect(r.groups[1].events.map((e) => e.id).sort()).toEqual(["a", "ap", "s"]);
	});

	it("pages 25 groups at a time by cursor without splitting a group", async () => {
		// 30 unlinked groups at t=100..129, plus cr-big (40 events, latest t=115) in the middle.
		await seed([
			...Array.from({ length: 30 }, (_, i) => ({
				id: `g${String(i).padStart(2, "0")}`,
				at: 100 + i,
			})),
			...Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, at: 76 + i, cr: "cr-big" })),
			// same latestAt as cr-big: tie broken by group key desc
			{ id: "tie", at: 115, cr: "cr-a" },
		]);
		const all: string[] = [];
		let cursor: string | null | undefined;
		let pages = 0;
		do {
			const r = await listAuditGroups(db, OWNER, { cursor: cursor ?? undefined });
			expect(r.groups.length).toBeLessThanOrEqual(25);
			for (const g of r.groups) if (g.key === "cr-big") expect(g.events).toHaveLength(40);
			all.push(...keys(r));
			cursor = r.nextCursor;
			pages++;
		} while (cursor);
		expect(pages).toBe(2);
		expect(all).toHaveLength(32);
		expect(new Set(all).size).toBe(32);
		expect(all.slice(13, 17)).toEqual(["g16", "g15", "cr-big", "cr-a"]);
	});

	describe("filters match a group if any of its events matches, returning all its events", () => {
		beforeEach(() =>
			seed([
				// cr1 on p1: submitted by a member, approved by owner
				{ id: "s", at: 1, action: "change_request.submitted", cr: "cr1", actor: "u-member" },
				{ id: "a", at: 5, action: "change_request.approved", cr: "cr1" },
				{ id: "ap", at: 5, action: "relation.added", cr: "cr1", counterpart: "p2" },
				{ id: "d", at: 3, action: "address.added", profileId: "p3" },
				{ id: "x", at: 4, action: "profile.deleted", profileId: "gone" },
			])
		);

		it("profile: subject or counterpart, so relation events show in both profiles' history", async () => {
			const p1 = await listAuditGroups(db, OWNER, { profileId: "p1" });
			const p2 = await listAuditGroups(db, OWNER, { profileId: "p2" });
			expect(keys(p1)).toEqual(["cr1"]);
			expect(keys(p2)).toEqual(["cr1"]);
			expect(p2.groups[0].events).toHaveLength(3);
		});

		it("profile: a deleted profile's events are still listed", async () => {
			expect(keys(await listAuditGroups(db, OWNER, { profileId: "gone" }))).toEqual(["x"]);
		});

		it("actions", async () => {
			const r = await listAuditGroups(db, OWNER, {
				actions: ["change_request.submitted", "profile.deleted"],
			});
			expect(keys(r)).toEqual(["cr1", "x"]);
			expect(r.groups[0].events).toHaveLength(3);
		});

		it("actor", async () => {
			expect(keys(await listAuditGroups(db, OWNER, { actorUserId: "u-member" }))).toEqual(["cr1"]);
		});

		it("date range (inclusive)", async () => {
			const r = await listAuditGroups(db, OWNER, { from: 1, to: 3 });
			expect(keys(r)).toEqual(["cr1", "d"]);
		});

		it("combined filters must hold on the same event", async () => {
			const r = await listAuditGroups(db, OWNER, {
				actorUserId: "u-member",
				actions: ["change_request.approved"],
			});
			expect(keys(r)).toEqual([]);
		});
	});

	it("facets: distinct actors and subject profiles with their latest names, A→Z", async () => {
		await seed([
			{ id: "1", at: 1, actor: "u-b", profileId: "p1" },
			{ id: "2", at: 2, actor: "u-a", profileId: "p2" },
			{ id: "3", at: 3, actor: "u-b", profileId: "p1", counterpart: "p9" },
			{ id: "x", at: 4, actor: "u-x", profileId: "px", org: "o2" },
		]);
		await db
			.update(auditEvent)
			.set({ actorName: "Bee", profileName: "Pone" })
			.where(eq(auditEvent.id, "3"));
		await db
			.update(auditEvent)
			.set({ actorName: "Ay", profileName: "Ptwo" })
			.where(eq(auditEvent.id, "2"));
		expect(await listAuditFacets(db, OWNER)).toEqual({
			actors: [
				{ id: "u-a", name: "Ay" },
				{ id: "u-b", name: "Bee" },
			],
			profiles: [
				{ id: "p1", name: "Pone" },
				{ id: "p2", name: "Ptwo" },
			],
		});
	});

	it("requires auditEvent.read", async () => {
		const member: Actor = { ...OWNER, role: "member" };
		await expect(listAuditGroups(db, member, {})).rejects.toMatchObject({ kind: "Forbidden" });
		await expect(listAuditFacets(db, member)).rejects.toMatchObject({ kind: "Forbidden" });
	});
});
