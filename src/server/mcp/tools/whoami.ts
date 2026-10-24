import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityProfile, organization } from "@/db/schema";
import { AppError } from "@/domain/errors";
import { WRITE_DENIED_HINT } from "@/domain/mcpWrite";
import type { ConnectionActor } from "../actor";

export const whoamiOutput = z.object({
	userId: z.string(),
	organization: z.object({ id: z.string(), name: z.string() }),
	role: z.enum(["owner", "admin", "member"]),
	profileId: z.string().nullable(),
	canWrite: z
		.boolean()
		.describe("True when write tools are available on this connection right now."),
	reason: z
		.enum(["connection_read_only", "org_writes_off"])
		.nullable()
		.describe(
			"Why canWrite is false: this connection is read only, or the owner turned AI changes off."
		),
	hint: z.string().nullable().describe("What the member can do about it."),
});

export async function whoami(actor: ConnectionActor): Promise<z.input<typeof whoamiOutput>> {
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
		canWrite: actor.write.canWrite,
		reason: actor.write.canWrite ? null : actor.write.reason,
		hint: actor.write.canWrite ? null : WRITE_DENIED_HINT[actor.write.reason],
	};
}
