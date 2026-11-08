import { beforeEach, describe, expect, it } from "vitest";
import { communityProfile, post } from "@/db/schema";
import { createCommentInput, memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { createComment, listComments, removeComment } from "./comments";
import { getPost, listFeed } from "./feed";
import { createMemory } from "./memory";

const AUTHOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "u2", organizationId: "o1", role: "member" };
const ADMIN: Actor = { userId: "u3", organizationId: "o1", role: "admin" };
const OUTSIDER: Actor = { userId: "u9", organizationId: "o2", role: "owner" };

describe("Comment input", () => {
	const parse = (body: string) => createCommentInput.safeParse({ postId: "p1", body });

	it("rejects empty, whitespace-only and 1001-char comments", () => {
		expect(parse("").success).toBe(false);
		expect(parse("  \n\t ").success).toBe(false);
		expect(parse("x".repeat(1001)).success).toBe(false);
		expect(parse("x".repeat(1000)).success).toBe(true);
	});

	it("trims, keeps inner line breaks and URLs as plain text", () => {
		expect(parse("  hi\n\nsee https://x.test  ").data?.body).toBe("hi\n\nsee https://x.test");
	});
});

describe("Comments", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let clock = 1_000;
	let seq = 0;
	const deps = () => ({
		db,
		now: () => new Date(clock),
		newId: () => `c${String(++seq).padStart(3, "0")}`,
	});
	const post_ = (actor: Actor, title: string) =>
		createMemory(deps(), actor, "Snap", memoryInput.parse({ title }));
	const comment = (actor: Actor, postId: string, body: string, name = "Snap Commenter") => {
		clock += 1;
		return createComment(deps(), actor, name, { postId, body });
	};

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

	it("lists newest first, 20 per page, by visible profile else snapshot name", async () => {
		const { postId } = await post_(AUTHOR, "A");
		await db.insert(communityProfile).values({
			id: "cp1",
			firstName: "Asha",
			lastName: "Patel",
			status: "active",
			organizationId: "o1",
			userId: "u1",
		});
		for (let i = 0; i < 21; i++) await comment(OTHER, postId, `n${i}`, "Old Name");
		await comment(AUTHOR, postId, "line one\nline two", "asha old");

		const first = await listComments(db, OTHER, { postId });
		expect(first.comments).toHaveLength(20);
		expect(first.comments[0]).toMatchObject({
			body: "line one\nline two",
			authorUserId: "u1",
			author: { name: "Asha Patel", initials: "AP", profileId: "cp1" },
		});
		expect(first.comments[1]!.author).toEqual({
			name: "Old Name",
			initials: "ON",
			profileId: null,
		});
		const second = await listComments(db, OTHER, { postId, cursor: first.nextCursor! });
		expect(second.comments.map((c) => c.body)).toEqual(["n1", "n0"]);
		expect(second.nextCursor).toBeNull();
	});

	it("comment counts ride the Feed read", async () => {
		const { postId: a } = await post_(AUTHOR, "A");
		await post_(AUTHOR, "B");
		await comment(OTHER, a, "one");
		await comment(AUTHOR, a, "two");

		const { posts } = await listFeed(db, OTHER, {});
		expect(Object.fromEntries(posts.map((p) => [p.data.title, p.commentCount]))).toEqual({
			A: 2,
			B: 0,
		});
		expect((await getPost(db, OTHER, a)).commentCount).toBe(2);
	});

	it("comment author and owner/admin remove; the Post author gets no extra right", async () => {
		const { postId } = await post_(AUTHOR, "A");
		const { commentId: mine } = await comment(OTHER, postId, "by other");
		const { commentId: second } = await comment(OTHER, postId, "by other 2");

		await expect(removeComment(db, AUTHOR, { commentId: mine })).rejects.toMatchObject({
			kind: "Forbidden",
		});
		await removeComment(db, OTHER, { commentId: mine });
		await removeComment(db, ADMIN, { commentId: second });
		expect((await listComments(db, AUTHOR, { postId })).comments).toEqual([]);
	});

	it("removing a removed comment succeeds; another org's comment is untouched", async () => {
		const { postId } = await post_(AUTHOR, "A");
		const { commentId } = await comment(OTHER, postId, "hi");
		await removeComment(db, OUTSIDER, { commentId });
		expect((await listComments(db, AUTHOR, { postId })).comments).toHaveLength(1);
		await removeComment(db, OTHER, { commentId });
		await removeComment(db, OTHER, { commentId });
		await removeComment(db, OTHER, { commentId: "never" });
	});

	it("a comment on a removed or another org's Post is NotFound", async () => {
		const { postId } = await post_(AUTHOR, "A");
		await expect(comment(OUTSIDER, postId, "x")).rejects.toMatchObject({ kind: "NotFound" });
		await expect(listComments(db, OUTSIDER, { postId })).rejects.toMatchObject({
			kind: "NotFound",
		});
		await db.delete(post);
		await expect(comment(AUTHOR, postId, "x")).rejects.toMatchObject({
			kind: "NotFound",
			message: "This Post was removed",
		});
	});
});
