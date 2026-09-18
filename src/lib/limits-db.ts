import { db } from "@/db";
import { member, invitation } from "@/db/auth-schema";
import { communityProfile } from "@/db/app-schema";
import { and, count, eq } from "drizzle-orm";

export async function countUserMemberships(userId: string): Promise<number> {
	const [result] = await db.select({ n: count() }).from(member).where(eq(member.userId, userId));
	return result?.n ?? 0;
}

export async function countOrgMembersAndPending(organizationId: string): Promise<number> {
	const [[memberResult], [invitationResult]] = await Promise.all([
		db.select({ n: count() }).from(member).where(eq(member.organizationId, organizationId)),
		db
			.select({ n: count() })
			.from(invitation)
			.where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, "pending"))),
	]);
	return (memberResult?.n ?? 0) + (invitationResult?.n ?? 0);
}

export async function countOrgProfiles(organizationId: string): Promise<number> {
	const [result] = await db
		.select({ n: count() })
		.from(communityProfile)
		.where(eq(communityProfile.organizationId, organizationId));
	return result?.n ?? 0;
}
