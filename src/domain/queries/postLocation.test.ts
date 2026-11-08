import { beforeEach, describe, expect, it } from "vitest";
import { memoryInput } from "@/domain/feed";
import type { Actor } from "@/domain/permission";
import { freshDb } from "@/test/sqliteDb";
import { createMemory } from "./memory";
import { locatePost } from "./postLocation";

const AUTHOR: Actor = { userId: "u1", organizationId: "o1", role: "member" };

describe("Share link: locatePost", () => {
	let db: ReturnType<typeof freshDb>["db"];
	let sqlite: ReturnType<typeof freshDb>["sqlite"];
	let postId: string;

	beforeEach(async () => {
		const fresh = freshDb();
		({ db, sqlite } = fresh);
		fresh.sqlite.exec(`
			INSERT INTO organization (id, name, slug, created_at) VALUES ('o1', 'Patel Parivar', 'o1', 0), ('o2', 'Shah Samaj', 'o2', 0);
			INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES
				('u1', 'U1', 'u1@x.test', 1, 0, 0),
				('u2', 'U2', 'u2@x.test', 1, 0, 0),
				('u3', 'U3', 'u3@x.test', 1, 0, 0),
				('u4', 'U4', 'u4@x.test', 1, 0, 0);
			INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES
				('m1', 'o1', 'u1', 'member', 0),
				('m2', 'o1', 'u2', 'member', 0),
				('m3', 'o2', 'u2', 'owner', 0),
				('m4', 'o2', 'u3', 'owner', 0);
			INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id) VALUES
				('i1', 'o1', 'u4@x.test', 'member', 'pending', 9999999999999, 'u1');
		`);
		({ postId } = await createMemory(
			{ db, newId: () => "p1" },
			AUTHOR,
			"U1",
			memoryInput.parse({ title: "Diwali 1998", description: "" })
		));
	});

	it("a member with the Post's org active: found", async () => {
		expect(await locatePost(db, { userId: "u2", activeOrganizationId: "o1" }, postId)).toEqual({
			status: "found",
		});
	});

	it("a member with another org active: other org, naming the community", async () => {
		expect(await locatePost(db, { userId: "u2", activeOrganizationId: "o2" }, postId)).toEqual({
			status: "otherOrg",
			organization: { id: "o1", name: "Patel Parivar" },
		});
	});

	it("non-member, invitee, ex-member and unknown id get one identical NotFound", async () => {
		const outcome = (userId: string, id = postId) =>
			locatePost(db, { userId, activeOrganizationId: "o2" }, id).then(
				() => "resolved",
				(e: unknown) => JSON.stringify({ e, message: (e as Error).message })
			);
		const unknown = await outcome("u2", "nope");
		expect(unknown).toContain("NotFound");
		expect(await outcome("u3")).toBe(unknown); // non-member
		expect(await outcome("u4")).toBe(unknown); // invitee who hasn't accepted
		sqlite.exec("DELETE FROM member WHERE id = 'm2'");
		expect(await outcome("u2")).toBe(unknown); // ex-member
		expect(await outcome("u1")).toBe("resolved");
		sqlite.exec("DELETE FROM post WHERE id = 'p1'");
		expect(await outcome("u1")).toBe(unknown); // removed Post (hard delete)
	});
});
