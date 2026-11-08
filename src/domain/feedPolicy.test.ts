import { describe, expect, it } from "vitest";
import { canEditPost, canRemoveComment, canRemovePost, postActions } from "./feedPolicy";
import type { Actor } from "./permission";

const AUTHOR: Actor = { userId: "author", organizationId: "o1", role: "member" };
const OTHER: Actor = { userId: "other", organizationId: "o1", role: "member" };
const ADMIN: Actor = { userId: "admin", organizationId: "o1", role: "admin" };
const OWNER: Actor = { userId: "owner", organizationId: "o1", role: "owner" };

const byAuthor = { authorUserId: "author" };
const byOwner = { authorUserId: "owner" };
// Author left the org: their Post stays, nobody gets an author's rights from it.
const byExMember = { authorUserId: "gone" };

describe("Feed policy", () => {
	const table: [
		string,
		Actor | null,
		{ authorUserId: string },
		{ edit: boolean; remove: boolean },
	][] = [
		["author", AUTHOR, byAuthor, { edit: true, remove: true }],
		["other member", OTHER, byAuthor, { edit: false, remove: false }],
		["admin", ADMIN, byAuthor, { edit: false, remove: true }],
		["owner", OWNER, byAuthor, { edit: false, remove: true }],
		["admin on an owner's Post", ADMIN, byOwner, { edit: false, remove: true }],
		["member on an ex-member's Post", OTHER, byExMember, { edit: false, remove: false }],
		["admin on an ex-member's Post", ADMIN, byExMember, { edit: false, remove: true }],
		// Rejoined with the same user id: rights come back (role only, no ex-member logic).
		["author who rejoined", { ...AUTHOR, role: "member" }, byAuthor, { edit: true, remove: true }],
		["ex-member (no actor)", null, byAuthor, { edit: false, remove: false }],
	];

	for (const [who, actor, target, want] of table) {
		it(`${who}: edit ${want.edit}, remove ${want.remove}`, () => {
			expect(canEditPost(actor, target)).toBe(want.edit);
			expect(canRemovePost(actor, target)).toBe(want.remove);
			// Comment removal follows the same rule; the Post's author gets no extra right.
			expect(canRemoveComment(actor, target)).toBe(want.remove);
			expect(postActions(actor, target)).toEqual(want);
		});
	}

	it("a Post's author can't remove someone else's comment on it", () => {
		expect(canRemoveComment(AUTHOR, { authorUserId: "other" })).toBe(false);
	});
});
