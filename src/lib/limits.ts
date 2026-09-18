export const ORG_LIMIT = 5;
export const MEMBER_LIMIT = 1000;
export const PROFILE_LIMIT = MEMBER_LIMIT;

export const canJoinOrganization = (membershipCount: number) => membershipCount < ORG_LIMIT;
export const canInviteMember = (membersPlusPending: number) => membersPlusPending < MEMBER_LIMIT;
export const canCreateProfile = (profileCount: number) => profileCount < PROFILE_LIMIT;

export const LIMIT_ERROR_CODES = {
	org: "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS",
	member: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
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
