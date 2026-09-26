import { db } from "@/db";
import { communityProfileCustomField } from "@/db/app-schema";
import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { generatePrimaryKey } from "@/lib/generate";
import { assertCan } from "@/domain/permission";
import { customFieldTypeSchema, type CustomFieldDefinition } from "@/domain/customFields";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(
		async ({ context }): Promise<CustomFieldDefinition[]> =>
			db.query.communityProfileCustomField.findMany({
				where: (fields, operators) =>
					operators.eq(fields.organizationId, context.actor.organizationId),
				columns: { id: true, label: true, type: true },
			})
	);

export const addOrganizationCustomField = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			label: z.string().min(1, "Label is required"),
			type: customFieldTypeSchema,
		})
	)
	.handler(async ({ context, data }) => {
		assertCan(context.actor, { customFields: ["create"] });

		const { organizationId } = context.actor;

		await db.insert(communityProfileCustomField).values({
			organizationId: organizationId,
			label: data.label,
			type: data.type,
			id: generatePrimaryKey(),
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
