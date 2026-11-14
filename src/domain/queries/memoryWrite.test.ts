import { beforeEach, describe, expect, it } from "vitest";
import { post, postMemory } from "@/db/schema";
import { memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { getPost, listFeed } from "./feed";
import { createMemory, getMemoryForEdit, updateMemory } from "./memory";
import { removePost } from "./postBase";

const AUTHOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "u2", organizationId: "o1", role: "member" };
const ADMIN: Actor = { userId: "u3", organizationId: "o1", role: "admin" };
const OWNER: Actor = { userId: "u4", organizationId: "o1", role: "owner" };
const OUTSIDER_ADMIN: Actor = { userId: "u9", organizationId: "o2", role: "admin" };

describe("Memory edit and remove", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let clock = 1_000;
	let seq = 0;
	const deps = () => ({
		db,
		now: () => new Date(clock),
		newId: () => `p${String(++seq).padStart(3, "0")}`,
	});
	const share = (actor: Actor, title: string, description = "") =>
		createMemory(deps(), actor, "Snap", memoryInput.parse({ title, description }));
	const edit = (actor: Actor, postId: string, title: string, description = "") =>
		updateMemory(deps(), actor, postId, memoryInput.parse({ title, description }));

	beforeEach(() => {
		const fresh = freshDb();
		db = fresh.db;
		clock = 1_000;
		seq = 0;
		fresh.sqlite.exec(
			`INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Org 1', 'o1', 0), ('o2', 'Org 2', 'o2', 0);`
		);
	});

	it("the author edits title and description; marked edited, Feed order unchanged", async () => {
		const { postId } = await share(AUTHOR, "Old", "old text");
		clock += 1;
		await share(OTHER, "Newer");
		clock += 1;

		await edit(AUTHOR, postId, "New title", "**Bold** memory");

		const page = await listFeed(db, OTHER, {});
		expect(page.posts.map((p) => p.data.title)).toEqual(["Newer", "New title"]);
		expect(page.posts[1]).toMatchObject({
			// The UI runs the Feed policy against it.
			authorUserId: "u1",
			createdAt: new Date(1_000),
			editedAt: new Date(1_002),
			data: { descriptionText: "Bold memory" },
		});
		expect(await getMemoryForEdit(db, AUTHOR, postId)).toEqual({
			title: "New title",
			description: "**Bold** memory",
			media: [],
		});
	});

	it("an edit may empty the description", async () => {
		const { postId } = await share(AUTHOR, "T", "something");
		await edit(AUTHOR, postId, "T", "  ");
		expect((await getPost(db, AUTHOR, postId)).data).toEqual({
			title: "T",
			descriptionDoc: null,
			media: [],
		});
	});

	it("blocks an edit whose description fails the rules, changing nothing", async () => {
		const { postId } = await share(AUTHOR, "T", "keep");
		await expect(edit(AUTHOR, postId, "X", "- a\n  - b\n    - c\n      - d")).rejects.toMatchObject(
			{ kind: "Invalid" }
		);
		expect(await getMemoryForEdit(db, AUTHOR, postId)).toEqual({
			title: "T",
			description: "keep",
			media: [],
		});
		expect((await getPost(db, AUTHOR, postId)).editedAt).toBeNull();
	});

	it("only the author edits: other member, admin and owner are Forbidden", async () => {
		const { postId } = await share(AUTHOR, "Mine", "src");
		for (const actor of [OTHER, ADMIN, OWNER]) {
			await expect(edit(actor, postId, "Hijack")).rejects.toMatchObject({ kind: "Forbidden" });
			await expect(getMemoryForEdit(db, actor, postId)).rejects.toMatchObject({
				kind: "Forbidden",
			});
		}
		expect(await getMemoryForEdit(db, AUTHOR, postId)).toEqual({
			title: "Mine",
			description: "src",
			media: [],
		});
	});

	it("another org's admin gets NotFound for edit, edit load and remove", async () => {
		const { postId } = await share(AUTHOR, "Mine");
		// Same user id as the author, other org: still NotFound, the policy never runs.
		const sameUserElsewhere: Actor = { ...AUTHOR, organizationId: "o2" };
		for (const actor of [OUTSIDER_ADMIN, sameUserElsewhere]) {
			await expect(edit(actor, postId, "X")).rejects.toMatchObject({ kind: "NotFound" });
			await expect(getMemoryForEdit(db, actor, postId)).rejects.toMatchObject({
				kind: "NotFound",
			});
			await expect(removePost(db, actor, postId)).rejects.toMatchObject({ kind: "NotFound" });
		}
		expect(await db.select().from(post)).toHaveLength(1);
	});

	it("an unknown id is NotFound", async () => {
		await expect(edit(AUTHOR, "missing", "X")).rejects.toMatchObject({ kind: "NotFound" });
		await expect(removePost(db, ADMIN, "missing")).rejects.toMatchObject({ kind: "NotFound" });
	});

	it("a plain member can't remove someone else's Post", async () => {
		const { postId } = await share(AUTHOR, "Mine");
		await expect(removePost(db, OTHER, postId)).rejects.toMatchObject({ kind: "Forbidden" });
		expect(await db.select().from(post)).toHaveLength(1);
	});

	it("the author removes their own Post", async () => {
		const { postId } = await share(AUTHOR, "Mine");
		await removePost(db, AUTHOR, postId);
		await expect(getPost(db, AUTHOR, postId)).rejects.toMatchObject({ kind: "NotFound" });
	});

	it("an admin removes an owner's Post; no rows left behind", async () => {
		const { postId } = await share(OWNER, "Owner's", "text");
		const { postId: kept } = await share(OTHER, "Stays");
		await removePost(db, ADMIN, postId);

		expect((await db.select().from(post)).map((r) => r.id)).toEqual([kept]);
		expect((await db.select().from(postMemory)).map((r) => r.postId)).toEqual([kept]);
	});
});
