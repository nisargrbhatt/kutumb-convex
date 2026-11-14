import { beforeEach, describe, expect, it } from "vitest";
import { communityProfile, post } from "@/db/schema";
import { memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { getPost, listFeed } from "./feed";
import { listLikers, setLike } from "./likes";
import { createMemory } from "./memory";

const MEMBER: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "u2", organizationId: "o1", role: "member" };
const OUTSIDER: Actor = { userId: "u9", organizationId: "o2", role: "owner" };

describe("Likes", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let clock = 1_000;
	let seq = 0;
	const deps = () => ({
		db,
		now: () => new Date(clock),
		newId: () => `p${String(++seq).padStart(3, "0")}`,
	});
	const post_ = (actor: Actor, title: string) =>
		createMemory(deps(), actor, "Snap", memoryInput.parse({ title }));
	const like = (actor: Actor, postId: string, liked: boolean, name = "Snap Liker") =>
		setLike(deps(), actor, name, { postId, liked });

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		clock = 1_000;
		seq = 0;
		fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U1', 'u1@x.test', 1, 0, 0);
		`);
	});

	const likesOf = async (viewer: Actor) =>
		Object.fromEntries((await listFeed(db, viewer, {})).posts.map((p) => [p.data.title, p.likes]));

	it("`liked: true` twice leaves one like; counts and the viewer's state ride the Feed read", async () => {
		const { postId: a } = await post_(MEMBER, "A");
		await post_(MEMBER, "B");
		await like(MEMBER, a, true);
		await like(MEMBER, a, true);
		await like(OTHER, a, true);

		expect(await likesOf(MEMBER)).toEqual({
			A: { count: 2, viewerLiked: true },
			B: { count: 0, viewerLiked: false },
		});
		expect((await getPost(db, OTHER, a)).likes).toEqual({ count: 2, viewerLiked: true });
	});

	it("`liked: false` removes the like, and succeeds when there is none", async () => {
		const { postId } = await post_(MEMBER, "A");
		await like(MEMBER, postId, false);
		await like(MEMBER, postId, true);
		await like(MEMBER, postId, false);
		await like(MEMBER, postId, false);
		expect(await likesOf(MEMBER)).toEqual({ A: { count: 0, viewerLiked: false } });
	});

	it("a like on a removed or another org's Post is NotFound", async () => {
		const { postId } = await post_(MEMBER, "A");
		await expect(like(OUTSIDER, postId, true)).rejects.toMatchObject({ kind: "NotFound" });
		await db.delete(post);
		await expect(like(MEMBER, postId, true)).rejects.toMatchObject({ kind: "NotFound" });
		await expect(like(MEMBER, postId, false)).rejects.toMatchObject({ kind: "NotFound" });
	});

	it("who liked: newest first, 50 per page, by visible profile else snapshot name", async () => {
		const { postId } = await post_(MEMBER, "A");
		await db.insert(communityProfile).values({
			id: "cp1",
			firstName: "Asha",
			lastName: "Patel",
			status: "active",
			organizationId: "o1",
			userId: "u1",
		});
		for (let i = 0; i < 52; i++) {
			clock += 1;
			const actor: Actor = { userId: `x${i}`, organizationId: "o1", role: "member" };
			await like(actor, postId, true, `Liker ${i}`);
		}
		clock += 1;
		await like(MEMBER, postId, true, "asha old");

		const first = await listLikers(db, OTHER, { postId });
		expect(first.likers).toHaveLength(50);
		expect(first.likers.slice(0, 2).map((l) => l.author)).toEqual([
			{ name: "Asha Patel", initials: "AP", profileId: "cp1", photoBlobId: null },
			{ name: "Liker 51", initials: "L5", profileId: null, photoBlobId: null },
		]);
		const second = await listLikers(db, OTHER, { postId, cursor: first.nextCursor! });
		expect(second.likers.map((l) => l.author.name)).toEqual(["Liker 2", "Liker 1", "Liker 0"]);
		expect(second.nextCursor).toBeNull();
	});

	it("a like outlives its member, shown by snapshot name", async () => {
		const { postId } = await post_(MEMBER, "A");
		await like(OTHER, postId, true, "Gone Member");
		// Member left: no user, no profile; the like stays.
		expect(await likesOf(MEMBER)).toEqual({ A: { count: 1, viewerLiked: false } });
		const { likers } = await listLikers(db, MEMBER, { postId });
		expect(likers.map((l) => l.author)).toEqual([
			{ name: "Gone Member", initials: "GM", profileId: null, photoBlobId: null },
		]);
	});

	it("who liked on a removed or another org's Post is NotFound", async () => {
		const { postId } = await post_(MEMBER, "A");
		await expect(listLikers(db, OUTSIDER, { postId })).rejects.toMatchObject({
			kind: "NotFound",
		});
		await expect(listLikers(db, MEMBER, { postId: "missing" })).rejects.toMatchObject({
			kind: "NotFound",
		});
	});
});
