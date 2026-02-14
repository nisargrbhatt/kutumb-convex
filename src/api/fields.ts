import { db } from "@/db";
import { CUSTOM_FIELD_TYPE } from "@/db/constants";
import { communityProfileCustomField, type PrimaryKey } from "@/db/schema";
import { checkOrgRoleResult } from "@/handler/organization";
import { generatePrimaryKey } from "@/lib/generate";
import { authMiddleware } from "@/middleware/auth";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import * as z from "zod";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			organizationSlug: z.string().min(1, "organizationSlug is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const orgRoleCheck = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data.organizationSlug,
			requiredRoles: ["owner"],
		});

		if (!orgRoleCheck) {
			throw new Error("You do not have permission to get this resource");
		}

		const customFields = await db.query.communityProfileCustomField.findMany({
			where: (fields, operators) => operators.eq(fields.organizationId, orgRoleCheck.id),
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
			organizationSlug: z.string().min(1, "organizationSlug is required"),
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
		const orgRoleCheck = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data?.organizationSlug,
			requiredRoles: ["owner"],
		});

		if (!orgRoleCheck) {
			throw new Error("You do not have permission to add this resource");
		}

		await db.insert(communityProfileCustomField).values({
			organizationId: orgRoleCheck?.id,
			label: data.label,
			type: data.type,
			id: generatePrimaryKey("communityProfileCustomField"),
		});

		return {
			message: "Custom field added successfully",
		};
	});

export const deleteOrganizationCustomField = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			organizationSlug: z.string().min(1, "organizationSlug is required"),
			fieldId: z.string().min(1, "fieldId is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const orgRoleCheck = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data?.organizationSlug,
			requiredRoles: ["owner"],
		});

		if (!orgRoleCheck) {
			throw new Error("You do not have permission to add this resource");
		}

		await db
			.delete(communityProfileCustomField)
			.where(
				and(
					eq(
						communityProfileCustomField.id,
						data.fieldId as PrimaryKey<"communityProfileCustomField">
					),
					eq(communityProfileCustomField.organizationId, orgRoleCheck.id)
				)
			)
			.limit(1);

		return {
			message: "Custom field deleted successfully",
		};
	});

export const getOrganizationCustomFieldsQuery = (props: { orgSlug: string }) =>
	queryOptions({
		queryKey: ["get-organization-custom-fields", props.orgSlug],
		queryFn: ({ signal }) =>
			getOrganizationCustomFields({
				data: {
					organizationSlug: props.orgSlug,
				},
				signal,
			}),
	});
