import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityProfile, organization } from "@/db/schema";
import { AppError } from "@/domain/errors";
import { listCustomFieldDefinitions } from "@/domain/customFieldDefinitions";
import type { Actor } from "@/domain/permission";
import { customFieldDefinitionOutput } from "./listCustomFields";

export const whoamiOutput = z.object({
	userId: z.string(),
	organization: z.object({ id: z.string(), name: z.string() }),
	role: z.enum(["owner", "admin", "member"]),
	profileId: z.string().nullable(),
	customFields: z
		.array(customFieldDefinitionOutput)
		.describe("The community's custom fields; same list as list_custom_fields."),
});

export async function whoami(actor: Actor): Promise<z.input<typeof whoamiOutput>> {
	const [org, profile, customFields] = await Promise.all([
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
		listCustomFieldDefinitions(db, actor.organizationId),
	]);
	if (!org) throw new AppError("NotFound", "Community not found");
	return {
		userId: actor.userId,
		organization: org,
		role: actor.role,
		profileId: profile?.id ?? null,
		customFields,
	};
}
