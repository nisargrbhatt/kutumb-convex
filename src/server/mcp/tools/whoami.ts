import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityProfile, organization } from "@/db/schema";
import { AppError } from "@/domain/errors";
import type { Actor } from "@/domain/permission";

export const whoamiOutput = z.object({
	userId: z.string(),
	organization: z.object({ id: z.string(), name: z.string() }),
	role: z.enum(["owner", "admin", "member"]),
	profileId: z.string().nullable(),
});

export async function whoami(actor: Actor): Promise<z.input<typeof whoamiOutput>> {
	const [org, profile] = await Promise.all([
		db.query.organization.findFirst({
			where: eq(organization.id, actor.organizationId),
			columns: { id: true, name: true },
		}),
		db.query.communityProfile.findFirst({
			where: and(
				eq(communityProfile.userId, actor.userId),
				eq(communityProfile.organizationId, actor.organizationId)
			),
			columns: { id: true },
		}),
	]);
	if (!org) throw new AppError("NotFound", "Community not found");
	return {
		userId: actor.userId,
		organization: org,
		role: actor.role,
		profileId: profile?.id ?? null,
	};
}
