import { makeLimits } from "@/domain/limits";
import { countUserMemberships, countOrgMembersAndPending, countOrgProfiles } from "./limits-db";
import { captureLimitReached } from "./posthog-server";

export const limits = makeLimits(
	{
		userMemberships: countUserMemberships,
		orgMembersAndPending: countOrgMembersAndPending,
		orgProfiles: countOrgProfiles,
	},
	// Resolved at call time, so importing this module doesn't need the PostHog client.
	(e) => captureLimitReached(e)
);
