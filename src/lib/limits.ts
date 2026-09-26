import { makeLimits } from "@/domain/limits";
import { countUserMemberships, countOrgMembersAndPending, countOrgProfiles } from "./limits-db";
import { captureLimitReached } from "./posthog-server";

export const limits = makeLimits(
	{
		userMemberships: countUserMemberships,
		orgMembersAndPending: countOrgMembersAndPending,
		orgProfiles: countOrgProfiles,
	},
	captureLimitReached
);
