import { db } from "@/db";
import { communityProfileCustomField } from "@/db/app-schema";
import { captureLimitReached } from "@/lib/posthog-server";
import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { generatePrimaryKey } from "@/lib/generate";
import { assertCan } from "@/domain/permission";
import { customFieldTypeSchema, type CustomFieldDefinition } from "@/domain/customFields";
import {
	addCustomFieldDefinition,
	listCustomFieldDefinitions,
} from "@/domain/customFieldDefinitions";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(
		async ({ context }): Promise<CustomFieldDefinition[]> =>
			listCustomFieldDefinitions(db, context.actor.organizationId)
	);

export const addOrganizationCustomField = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			label: z.string().trim().min(1, "Label is required"),
			type: customFieldTypeSchema,
		})
	)
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { customFields: ["create"] });

		const { organizationId } = context.actor;

		await addCustomFieldDefinition(db, organizationId, data, {
			newId: generatePrimaryKey,
			onLimitReached: (e) => captureLimitReached({ ...e, userId: context.actor.userId }),
		});

		return {
			message: "Custom field added successfully",
		};
	});

export const deleteOrganizationCustomField = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			fieldId: z.string().min(1, "fieldId is required"),
		})
	)
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { customFields: ["delete"] });

		// Profile values keyed by this id are left in place; `valuesForDefs` drops orphans.

		const { organizationId } = context.actor;

		await db
			.delete(communityProfileCustomField)
			.where(
				and(
					eq(communityProfileCustomField.id, data.fieldId),
					eq(communityProfileCustomField.organizationId, organizationId)
				)
			)
			.limit(1);

		return {
			message: "Custom field deleted successfully",
		};
	});
