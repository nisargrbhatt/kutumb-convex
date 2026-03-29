import { db } from "@/db";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { communityProfileCustomField } from "@/db/app-schema";
import { authMiddleware } from "@/middleware/auth";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { auth } from "@/lib/auth";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { generatePrimaryKey } from "@/lib/generate";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const canReadCustomFields = await auth.api.hasPermission({
			headers: getRequestHeaders(),
			body: {
				permissions: {
					customFields: ["read"],
				},
			},
		});

		if (!canReadCustomFields.success) {
			throw new Error("You do not have permission to get this resource");
		}

		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

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
	.middleware([authMiddleware])
	.inputValidator(
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
		const canCreateCustomFields = await auth.api.hasPermission({
			headers: getRequestHeaders(),
			body: {
				permissions: {
					customFields: ["create"],
				},
			},
		});

		if (!canCreateCustomFields.success) {
			throw new Error("You do not have permission to create this resource");
		}

		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

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
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			fieldId: z.string().min(1, "fieldId is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const canDeleteCustomFields = await auth.api.hasPermission({
			headers: getRequestHeaders(),
			body: {
				permissions: {
					customFields: ["delete"],
				},
			},
		});

		if (!canDeleteCustomFields.success) {
			throw new Error("You do not have permission to delete this resource");
		}

		const organizationId = context?.session?.session?.activeOrganizationId;

		if (typeof organizationId !== "string") {
			throw new Error("No Organization Id found");
		}

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

export const getOrganizationCustomFieldsQuery = () =>
	queryOptions({
		queryKey: ["get-organization-custom-fields"],
		queryFn: ({ signal }) =>
			getOrganizationCustomFields({
				signal,
			}),
	});
