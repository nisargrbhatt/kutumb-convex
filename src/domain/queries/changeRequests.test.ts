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
import {
	listMyRequests,
	listPendingByProfile,
	markRequestsSeen,
	pendingCount,
	pendingForProfile,
	unseenCount,
} from "./changeRequests";

describe("Change Request read fns", () => {
	let h: ReturnType<typeof profileChangesHarness>;
	const info = (who: typeof MEMBER, profileId: string, over: Parameters<typeof input>[0]) =>
		h.changes.submit(who, {
			kind: "info",
			profileId,
			expectedVersion: 0,
			profile: input({ firstName: profileId.toUpperCase(), lastName: "Doe", ...over }),
		});
	const id = (res: { outcome: string; changeRequestId?: string }) => res.changeRequestId!;

	beforeEach(async () => {
		h = profileChangesHarness();
		await h.seed(
			{ id: "p", ...input({ firstName: "P", lastName: "Doe" }) },
			{ id: "q", ...input({ firstName: "Q", lastName: "Doe" }) }
		);
	});

	describe("listPendingByProfile", () => {
		it("groups by profile, oldest group first, requests oldest first, with stale + overlap", async () => {
			const q1 = id(await info(MEMBER, "q", { nickName: "Kay" }));
			const p1 = id(await info(MEMBER, "p", { nickName: "Pee" }));
			const p2 = id(await info(OTHER, "p", { nickName: "Peter", email: "p@x.test" }));
			const p3 = id(
				await h.changes.submit(OTHER, { kind: "address_add", profileId: "p", address })
			);
			// Direct edit of q's nickname makes q1 stale.
			await h.changes.submit(ADMIN, {
				kind: "info",
				profileId: "q",
				expectedVersion: 0,
				profile: input({ firstName: "Q", lastName: "Doe", nickName: "Q2" }),
			});

			const groups = await listPendingByProfile(h.db, ADMIN);

			expect(groups.map((g) => [g.profileId, g.count, g.staleCount, g.kinds])).toEqual([
				["q", 1, 1, ["info"]],
				["p", 3, 0, ["info", "address_add"]],
			]);
			expect(groups[0]).toMatchObject({ profileName: "Q Doe", profileStatus: "active" });
			expect(groups[0]!.requests[0]).toMatchObject({
				id: q1,
				stale: { code: "fields_changed", fields: ["nickName"] },
			});
			const p = groups[1]!;
			expect(p.oldestAt).toEqual(p.requests[0]!.createdAt);
			expect(p.requests.map((r) => [r.id, r.submitterName, r.stale, r.overlapsWith])).toEqual([
				[p1, "Mira Member", null, [p2]],
				[p2, "Otto Other", null, [p1]],
				[p3, "Otto Other", null, []],
			]);
		});

		it("includes pending create requests of drafts; skips closed requests", async () => {
			const draft = await h.changes.submit(MEMBER, { kind: "create", profile: input() });
			const w = id(await info(MEMBER, "p", { nickName: "Pee" }));
			await h.changes.withdraw(MEMBER, w);

			const groups = await listPendingByProfile(h.db, OWNER);
			expect(groups).toHaveLength(1);
			expect(groups[0]).toMatchObject({
				profileId: draft.profileId,
				profileStatus: "draft",
				kinds: ["create"],
			});
			expect(groups[0]!.requests[0]!.stale).toBeNull();
		});

		it("plain member → Forbidden", async () => {
			await expect(listPendingByProfile(h.db, MEMBER)).rejects.toBeInstanceOf(AppError);
			await expect(pendingCount(h.db, MEMBER)).rejects.toBeInstanceOf(AppError);
		});
	});

	it("pendingCount: pending requests in the org", async () => {
		await info(MEMBER, "p", { nickName: "A" });
		await info(OTHER, "q", { nickName: "B" });
		const w = id(await info(MEMBER, "q", { nickName: "C" }));
		await h.changes.withdraw(MEMBER, w);
		expect(await pendingCount(h.db, ADMIN)).toBe(2);
	});

	describe("submitter side", () => {
		it("listMyRequests: own only, newest first, with outcome fields + stale for pending", async () => {
			const a = id(await info(MEMBER, "p", { nickName: "A" }));
			const b = id(await info(MEMBER, "p", { nickName: "B" }));
			await info(OTHER, "q", { nickName: "X" });
			await h.changes.review(ADMIN, a, { decision: "reject", note: "No" });

			const mine = await listMyRequests(h.db, MEMBER);
			expect(mine.map((r) => [r.id, r.status])).toEqual([
				[b, "pending"],
				[a, "rejected"],
			]);
			expect(mine[1]).toMatchObject({
				resolutionNote: "No",
				resolvedByName: "Adi Admin",
				profileName: "P Doe",
				stale: null,
			});
		});

		it("unseenCount counts resolved-by-others since last look; markRequestsSeen resets it", async () => {
			const a = id(await info(MEMBER, "p", { nickName: "A" }));
			const b = id(await info(MEMBER, "q", { nickName: "B" }));
			const w = id(await info(MEMBER, "q", { email: "q@x.test" }));
			await info(MEMBER, "p", { email: "p@x.test" });
			await h.changes.review(ADMIN, a, { decision: "approve" });
			await h.changes.review(ADMIN, b, { decision: "reject", note: "No" });
			await h.changes.withdraw(MEMBER, w);

			expect(await unseenCount(h.db, MEMBER)).toBe(2);
			expect(await unseenCount(h.db, OTHER)).toBe(0);

			await markRequestsSeen(h.db, MEMBER, h.now());
			expect(await unseenCount(h.db, MEMBER)).toBe(0);

			await h.changes.deactivate(ADMIN, "p");
			expect(await unseenCount(h.db, MEMBER)).toBe(1);
		});

		it("pendingForProfile: owner/admin get every pending request; member only own", async () => {
			await info(MEMBER, "p", { nickName: "A" });
			await info(OTHER, "p", { nickName: "B" });
			await info(OTHER, "p", { email: "p@x.test" });
			await info(MEMBER, "q", { nickName: "C" });

			expect(await pendingForProfile(h.db, ADMIN, "p")).toEqual({ scope: "all", count: 3 });
			expect(await pendingForProfile(h.db, MEMBER, "p")).toEqual({ scope: "mine", count: 1 });
			expect(await pendingForProfile(h.db, OTHER, "q")).toEqual({ scope: "mine", count: 0 });
		});
	});
});
