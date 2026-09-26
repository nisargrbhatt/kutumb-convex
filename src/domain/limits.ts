import { AppError } from "./errors";

export const ORG_LIMIT = 5;
export const MEMBER_LIMIT = 1000;
export const PROFILE_LIMIT = MEMBER_LIMIT;

export const canJoinOrganization = (membershipCount: number) => membershipCount < ORG_LIMIT;
export const canInviteMember = (membersPlusPending: number) => membersPlusPending < MEMBER_LIMIT;
export const canCreateProfile = (profileCount: number) => profileCount < PROFILE_LIMIT;

export const LIMIT_ERROR_CODES = {
	org: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
	member: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
	profile: "COMMUNITY_PROFILE_LIMIT_REACHED",
} as const;

export const LIMIT_COPY = {
	orgCreate: {
		title: `You're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one to create a new organization. Limit is ${ORG_LIMIT} per account.`,
	},
	orgAccept: {
		title: `Can't accept — you're already in ${ORG_LIMIT} organizations`,
		description: `Leave or delete one, then accept this invite. Limit is ${ORG_LIMIT} per account.`,
	},
	memberInvite: {
		title: "Member limit reached",
		description: `This organization has ${MEMBER_LIMIT} members or pending invites. Remove a member or revoke an invite to send a new one.`,
	},
	profileAdmin: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles. Delete a profile to add another.`,
	},
	profileSelf: {
		title: "Profile limit reached",
		description: `This organization already has ${MEMBER_LIMIT} community profiles, so your profile can't be created yet. Ask an admin to free a slot.`,
	},
} as const;

export type LimitKind = keyof typeof LIMIT_ERROR_CODES;

export class LimitError extends AppError {
	constructor(public limit: LimitKind) {
		super("LimitReached", undefined, LIMIT_ERROR_CODES[limit]);
	}
}

export type Counters = {
	userMemberships(userId: string): Promise<number>;
	orgMembersAndPending(organizationId: string): Promise<number>;
	orgProfiles(organizationId: string): Promise<number>;
};

export type OnLimitReached = (e: {
	limit: LimitKind;
	organizationId?: string;
	userId?: string;
}) => void;

export const makeLimits = (counters: Counters, onReached: OnLimitReached) => ({
	async assertOrgSlot(userId: string) {
		const n = await counters.userMemberships(userId);
		if (!canJoinOrganization(n)) {
			onReached({ limit: "org", userId });
			throw new LimitError("org");
		}
	},
	async assertMemberSlot(organizationId: string) {
		const n = await counters.orgMembersAndPending(organizationId);
		if (!canInviteMember(n)) {
			onReached({ limit: "member", organizationId });
			throw new LimitError("member");
		}
	},
	async assertProfileSlot(organizationId: string, userId: string) {
		const n = await counters.orgProfiles(organizationId);
		if (!canCreateProfile(n)) {
			onReached({ limit: "profile", organizationId, userId });
			throw new LimitError("profile");
		}
	},
});

// Generic code -> copy mapping for consumers with no site-specific message (LIMIT_COPY entries
// with several variants per limit, e.g. orgCreate/orgAccept, still need to pick their own key).
export const limitMessage = (codeOrError: string | AppError | null | undefined) => {
	const code = typeof codeOrError === "string" ? codeOrError : codeOrError?.code;
	switch (code) {
		case LIMIT_ERROR_CODES.org:
			return LIMIT_COPY.orgAccept;
		case LIMIT_ERROR_CODES.member:
			return LIMIT_COPY.memberInvite;
		case LIMIT_ERROR_CODES.profile:
			return LIMIT_COPY.profileAdmin;
		default:
			return undefined;
	}
};
