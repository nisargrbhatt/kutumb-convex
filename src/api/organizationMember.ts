import { db } from "@/db";
import { checkOrgRoleResult } from "@/handler/organization";
import { authMiddleware } from "@/middleware/auth";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

export const getOrganizationMemberList = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			slug: z.string().min(1, "Organization slug is required"),
		})
	)
	.middleware([authMiddleware])
	.handler(async ({ context, data }) => {
		const checkRoleResult = await checkOrgRoleResult({
			userId: context.userId,
			organizationSlug: data.slug,
			requiredRoles: ["owner"],
		});

		if (!checkRoleResult) {
			throw new Error("You do not have permission to add this resource");
		}

		const organizationMemberList = await db.query.organizationMember.findMany({
			where: (fields, operators) => operators.eq(fields.organizationId, checkRoleResult.id),
			with: {
				member: {
					columns: {
						displayName: true,
						email: true,
						id: true,
					},
				},
			},
		});

		return organizationMemberList;
	});

export const getOrganizationMemberListQuery = (props: { slug: string }) =>
	queryOptions({
		queryKey: ["get-organization-member-list", props.slug],
		queryFn: async ({ signal }) =>
			getOrganizationMemberList({
				data: {
					slug: props.slug,
				},
				signal,
			}),
	});
