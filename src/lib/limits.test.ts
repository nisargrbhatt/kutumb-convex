import { describe, expect, it } from "vitest";
import {
	ORG_LIMIT,
	MEMBER_LIMIT,
	PROFILE_LIMIT,
	canJoinOrganization,
	canInviteMember,
	canCreateProfile,
	LIMIT_COPY,
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
