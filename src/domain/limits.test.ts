import { describe, expect, it, vi } from "vitest";
import {
	ORG_LIMIT,
	MEMBER_LIMIT,
	PROFILE_LIMIT,
	canJoinOrganization,
	canInviteMember,
	canCreateProfile,
	LIMIT_COPY,
	LIMIT_ERROR_CODES,
	LimitError,
	makeLimits,
	type Counters,
} from "./limits";

describe("canJoinOrganization", () => {
	it("allows at n-1", () => {
		expect(canJoinOrganization(ORG_LIMIT - 1)).toBe(true);
	});

	it("blocks at n", () => {
		expect(canJoinOrganization(ORG_LIMIT)).toBe(false);
	});

	it("blocks at n+1", () => {
		expect(canJoinOrganization(ORG_LIMIT + 1)).toBe(false);
	});
});

describe("canInviteMember", () => {
	it("allows at n-1", () => {
		expect(canInviteMember(MEMBER_LIMIT - 1)).toBe(true);
	});

	it("blocks at n", () => {
		expect(canInviteMember(MEMBER_LIMIT)).toBe(false);
	});

	it("blocks at n+1", () => {
		expect(canInviteMember(MEMBER_LIMIT + 1)).toBe(false);
	});
});

describe("canCreateProfile", () => {
	it("allows at n-1", () => {
		expect(canCreateProfile(PROFILE_LIMIT - 1)).toBe(true);
	});

	it("blocks at n", () => {
		expect(canCreateProfile(PROFILE_LIMIT)).toBe(false);
	});

	it("blocks at n+1", () => {
		expect(canCreateProfile(PROFILE_LIMIT + 1)).toBe(false);
	});
});

describe("LIMIT_COPY", () => {
	it("interpolates ORG_LIMIT into orgCreate copy", () => {
		expect(LIMIT_COPY.orgCreate.title).toContain(String(ORG_LIMIT));
		expect(LIMIT_COPY.orgCreate.description).toContain(String(ORG_LIMIT));
	});

	it("interpolates ORG_LIMIT into orgAccept copy", () => {
		expect(LIMIT_COPY.orgAccept.title).toContain(String(ORG_LIMIT));
		expect(LIMIT_COPY.orgAccept.description).toContain(String(ORG_LIMIT));
	});

	it("interpolates MEMBER_LIMIT into memberInvite copy", () => {
		expect(LIMIT_COPY.memberInvite.description).toContain(String(MEMBER_LIMIT));
	});

	it("interpolates MEMBER_LIMIT into profileAdmin copy", () => {
		expect(LIMIT_COPY.profileAdmin.description).toContain(String(MEMBER_LIMIT));
	});

	it("interpolates MEMBER_LIMIT into profileSelf copy", () => {
		expect(LIMIT_COPY.profileSelf.description).toContain(String(MEMBER_LIMIT));
	});
});

const fakeCounters = (n: number): Counters => ({
	userMemberships: async () => n,
	orgMembersAndPending: async () => n,
	orgProfiles: async () => n,
});

describe("makeLimits", () => {
	it("assertOrgSlot allows at n-1, blocks at n and n+1", async () => {
		await expect(
			makeLimits(fakeCounters(ORG_LIMIT - 1), vi.fn()).assertOrgSlot("u1")
		).resolves.toBeUndefined();
		await expect(makeLimits(fakeCounters(ORG_LIMIT), vi.fn()).assertOrgSlot("u1")).rejects.toThrow(
			LimitError
		);
		await expect(
			makeLimits(fakeCounters(ORG_LIMIT + 1), vi.fn()).assertOrgSlot("u1")
		).rejects.toThrow(LimitError);
	});

	it("assertMemberSlot allows at n-1, blocks at n and n+1", async () => {
		await expect(
			makeLimits(fakeCounters(MEMBER_LIMIT - 1), vi.fn()).assertMemberSlot("o1")
		).resolves.toBeUndefined();
		await expect(
			makeLimits(fakeCounters(MEMBER_LIMIT), vi.fn()).assertMemberSlot("o1")
		).rejects.toThrow(LimitError);
		await expect(
			makeLimits(fakeCounters(MEMBER_LIMIT + 1), vi.fn()).assertMemberSlot("o1")
		).rejects.toThrow(LimitError);
	});

	it("assertProfileSlot allows at n-1, blocks at n and n+1", async () => {
		await expect(
			makeLimits(fakeCounters(PROFILE_LIMIT - 1), vi.fn()).assertProfileSlot("o1", "u1")
		).resolves.toBeUndefined();
		await expect(
			makeLimits(fakeCounters(PROFILE_LIMIT), vi.fn()).assertProfileSlot("o1", "u1")
		).rejects.toThrow(LimitError);
		await expect(
			makeLimits(fakeCounters(PROFILE_LIMIT + 1), vi.fn()).assertProfileSlot("o1", "u1")
		).rejects.toThrow(LimitError);
	});

	it("calls onReached exactly once on throw, and not when within limit", async () => {
		const onReached = vi.fn();
		await makeLimits(fakeCounters(ORG_LIMIT - 1), onReached).assertOrgSlot("u1");
		expect(onReached).not.toHaveBeenCalled();

		await expect(
			makeLimits(fakeCounters(ORG_LIMIT), onReached).assertOrgSlot("u1")
		).rejects.toThrow(LimitError);
		expect(onReached).toHaveBeenCalledTimes(1);
		expect(onReached).toHaveBeenCalledWith({ limit: "org", userId: "u1" });
	});

	it("thrown LimitError carries the limit's error code", async () => {
		const err = await makeLimits(fakeCounters(MEMBER_LIMIT), vi.fn())
			.assertMemberSlot("o1")
			.catch((e) => e);
		expect(err).toBeInstanceOf(LimitError);
		expect(err.kind).toBe("LimitReached");
		expect(err.code).toBe(LIMIT_ERROR_CODES.member);
	});
});
