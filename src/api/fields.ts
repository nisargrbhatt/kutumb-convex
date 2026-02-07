import { db } from "@/db";
import type { PrimaryKey } from "@/db/schema";
import { checkOrgRoleResult } from "@/handler/organization";
import { authMiddleware } from "@/middleware/auth";
import { createServerFn } from "@tanstack/react-start";
import * as z from "zod";

export const getOrganizationCustomFields = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.inputValidator(
		z.object({
			organizationId: z.string().min(1, "organizationId is required"),
		})
	)
	.handler(async ({ context, data }) => {
		const orgRoleCheck = await checkOrgRoleResult({
			userId: context.userId,
			organizationId: data.organizationId,
			requiredRoles: ["owner"],
		});

		if (!orgRoleCheck) {
			throw new Error("You do not have permission to get this resource");
		}

		const customFields = await db.query.communityProfileCustomField.findMany({
			where: (fields, operators) =>
				operators.eq(fields.organizationId, data.organizationId as PrimaryKey<"organization">),
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
