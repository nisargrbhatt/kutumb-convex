import { db } from "@/db";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { communityProfileCustomField } from "@/db/app-schema";
import { orgMiddleware } from "@/middleware/org";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { generatePrimaryKey } from "@/lib/generate";
import { assertCan } from "@/domain/permission";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([orgMiddleware])
	.handler(async ({ context }) => {
		const { organizationId } = context.actor;

		const customFields = await db.query.communityProfileCustomField.findMany({
			where: (fields, operators) => operators.eq(fields.organizationId, organizationId),
			columns: {
				id: true,
				label: true,
				type: true,
			},
		});

		return {
			message: "Custom fields retrieved successfully",
			data: customFields,
		};
	});

export const addOrganizationCustomField = createServerFn({ method: "POST" })
	.middleware([orgMiddleware])
	.validator(
		z.object({
			label: z.string().min(1, "Label is required"),
			type: z.enum([
				CUSTOM_FIELD_TYPE.text,
				CUSTOM_FIELD_TYPE.number,
				CUSTOM_FIELD_TYPE.date,
				CUSTOM_FIELD_TYPE.boolean,
			]),
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
