import { beforeEach, describe, expect, it } from "vitest";
import { communityProfile, post, postMemory } from "@/db/schema";
import { memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { getPost, listFeed } from "./feed";
import { createMemory } from "./memory";

const MEMBER: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "u2", organizationId: "o1", role: "member" };
const ADMIN: Actor = { userId: "u3", organizationId: "o1", role: "admin" };
const OUTSIDER: Actor = { userId: "u9", organizationId: "o2", role: "owner" };

describe("Feed", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let clock = 1_000;
	let seq = 0;
	const deps = () => ({
		db,
		now: () => new Date(clock),
		newId: () => `p${String(++seq).padStart(3, "0")}`,
	});
	const post_ = (actor: Actor, title: string, description = "", authorName = "Snap Name") =>
		createMemory(deps(), actor, authorName, memoryInput.parse({ title, description }));

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		clock = 1_000;
		seq = 0;
		fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0), ('u2', 'U2', 'u2@x.test', 1, 0, 0);
		`);
	});

	it("a member's new Memory is live at once, at the top of the Feed", async () => {
		await post_(OTHER, "Older");
		clock += 1;
		const { postId } = await post_(MEMBER, "Diwali 1998", "We **lit** lamps");

		const page = await listFeed(db, OTHER, {});
		expect(page.posts.map((p) => p.id)).toEqual([postId, "p001"]);
		expect(page.posts[0]).toMatchObject({
			kind: "memory",
			data: { title: "Diwali 1998", descriptionText: "We lit lamps" },
			editedAt: null,
		});
		expect(page.nextCursor).toBeNull();
	});

	it("pages 10 at a time by `createdAt:id`, with no skip or repeat across `createdAt` ties", async () => {
		// 23 Posts, many sharing a `createdAt`, ids inserted out of order.
		const times = [5, 5, 5, 4, 4, 9, 9, 9, 9, 9, 9, 9, 1, 1, 1, 2, 3, 3, 3, 3, 7, 7, 7];
		const rows = times.map((t, i) => ({ id: `x${String((i * 7) % 23).padStart(2, "0")}`, t }));
		for (const r of rows)
			await db.insert(post).values({
				id: r.id,
				organizationId: "o1",
				kind: "memory",
				authorUserId: "u1",
				authorName: "A",
				createdAt: new Date(r.t),
			});
		for (const r of rows) await db.insert(postMemory).values({ postId: r.id, title: r.id });

		const expected = [...rows].sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : -1)).map((r) => r.id);
		const seen: string[] = [];
		const sizes: number[] = [];
		let cursor: string | undefined;
		do {
			const page = await listFeed(db, MEMBER, { cursor });
			sizes.push(page.posts.length);
			seen.push(...page.posts.map((p) => p.id));
			cursor = page.nextCursor ?? undefined;
		} while (cursor);
		expect(sizes).toEqual([10, 10, 3]);
		expect(seen).toEqual(expected);
	});

	it("refuses a malformed cursor", async () => {
		await post_(MEMBER, "A");
		await expect(listFeed(db, MEMBER, { cursor: "nope" })).rejects.toMatchObject({
			kind: "Invalid",
		});
	});

	it("shows an author with a visible profile by that profile, else by snapshot name", async () => {
		await db.insert(communityProfile).values([
			{
				id: "cp1",
				firstName: "Asha",
				lastName: "Patel",
				status: "active",
				organizationId: "o1",
				userId: "u1",
			},
			{
				id: "cp2",
				firstName: "Bina",
				lastName: "Shah",
				status: "inactive",
				organizationId: "o1",
				userId: "u2",
			},
		]);
		await post_(MEMBER, "By Asha", "", "asha old name");
		clock += 1;
		await post_(OTHER, "By Bina", "", "Bina Snapshot");
		clock += 1;
		await post_(ADMIN, "By admin, no profile", "", "Chetan Kumar Rao");

		const byTitle = async (viewer: Actor) =>
			Object.fromEntries(
				(await listFeed(db, viewer, {})).posts.map((p) => [p.data.title, p.author])
			);

		expect(await byTitle(MEMBER)).toEqual({
			"By Asha": { name: "Asha Patel", initials: "AP", profileId: "cp1" },
			// Inactive profile: a plain member can't see it.
			"By Bina": { name: "Bina Snapshot", initials: "BS", profileId: null },
			"By admin, no profile": { name: "Chetan Kumar Rao", initials: "CR", profileId: null },
		});
		// Owner/admin see the inactive profile.
		expect((await byTitle(ADMIN))["By Bina"]).toEqual({
			name: "Bina Shah",
			initials: "BS",
			profileId: "cp2",
		});
	});

	it("cards carry `descriptionText` only; detail carries `descriptionDoc` only", async () => {
		const { postId } = await post_(MEMBER, "T", "# Hi\nthere");
		const [card] = (await listFeed(db, MEMBER, {})).posts;
		expect(card.data).toEqual({ title: "T", descriptionText: "Hi there", media: [] });

		const detail = await getPost(db, MEMBER, postId);
		expect(detail.data).toEqual({
			title: "T",
			media: [],
			descriptionDoc: [
				{ t: "h2", c: [{ t: "text", v: "Hi" }] },
				{ t: "p", c: [{ t: "text", v: "there" }] },
			],
		});
	});

	it("ignores a client-sent `descriptionDoc` or `descriptionText`", async () => {
		const input = memoryInput.parse({
			title: "T",
			description: "plain",
			descriptionDoc: [{ t: "p", c: [{ t: "text", v: "evil" }] }],
			descriptionText: "evil",
		});
		const { postId } = await createMemory(deps(), MEMBER, "A", input);
		const [row] = await db.select().from(postMemory);
		expect(row).toEqual({
			postId,
			title: "T",
			description: "plain",
			descriptionDoc: [{ t: "p", c: [{ t: "text", v: "plain" }] }],
			descriptionText: "plain",
		});
	});

	it("blocks a save whose description fails the rules, writing nothing", async () => {
		await expect(post_(MEMBER, "T", "- a\n  - b\n    - c\n      - d")).rejects.toMatchObject({
			kind: "Invalid",
		});
		expect(await db.select().from(post)).toEqual([]);
	});

	it("stores no description when blank", async () => {
		const { postId } = await post_(MEMBER, "  Title  ", "   ");
		const detail = await getPost(db, MEMBER, postId);
		expect(detail.data).toEqual({ title: "Title", descriptionDoc: null, media: [] });
		const [row] = await db.select().from(postMemory);
		expect(row.description).toBeNull();
	});

	it("detail is scoped to the active org: another org's Post or an unknown id is NotFound", async () => {
		const { postId } = await post_(MEMBER, "Mine");
		await expect(getPost(db, OUTSIDER, postId)).rejects.toMatchObject({ kind: "NotFound" });
		await expect(getPost(db, MEMBER, "missing")).rejects.toMatchObject({ kind: "NotFound" });
		expect((await listFeed(db, OUTSIDER, {})).posts).toEqual([]);
	});
});
