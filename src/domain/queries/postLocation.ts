import { and, eq } from "drizzle-orm";
import { member, organization, post } from "@/db/schema";
import { AppError } from "@/domain/errors";
import type { QueryDb } from "./db";

export type PostLocation =
	| { status: "found" }
	| { status: "otherOrg"; organization: { id: string; name: string } };

/**
 * Share link read (spec: Feed > Share link). Skips active-org scoping: finds the Post's org
 * and checks membership itself. Non-member, invitee, ex-member, removed Post and unknown id all
 * throw the same `NotFound`, so ids can't be probed.
 */
export async function locatePost(
	db: QueryDb,
	viewer: { userId: string; activeOrganizationId: string | null | undefined },
	postId: string
): Promise<PostLocation> {
	const [row] = await db
		.select({ id: organization.id, name: organization.name })
		.from(post)
		.innerJoin(organization, eq(organization.id, post.organizationId))
		.innerJoin(
			member,
			and(eq(member.organizationId, post.organizationId), eq(member.userId, viewer.userId))
		)
		.where(eq(post.id, postId))
		.limit(1);
	if (!row) throw new AppError("NotFound", "Post not found");
	return row.id === viewer.activeOrganizationId
		? { status: "found" }
		: { status: "otherOrg", organization: row };
}
