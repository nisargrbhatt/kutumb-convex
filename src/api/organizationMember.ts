import { db } from "@/db";
import { ORGANIZATION_ROLES } from "@/db/constants";
import { organizationMember } from "@/db/schema";
import { checkOrgRoleResult } from "@/handler/organization";
import { generatePrimaryKey } from "@/lib/generate";
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

export const addOrganizationMember = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			slug: z.string().min(1, "Organization slug is required"),
			member: z.object({
				email: z.email().min(1, "Email is required"),
				role: z.enum([ORGANIZATION_ROLES.manager, ORGANIZATION_ROLES.member]),
			}),
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

		const checkExistProfile = await db.query.profile.findFirst({
			where: (fields, operators) => operators.eq(fields.email, data.member.email),
			columns: {
				id: true,
			},
		});

		if (!checkExistProfile) {
			throw new Error("User not found");
		}

		const checkExistingMember = await db.query.organizationMember.findFirst({
			where: (fields, operators) =>
				operators.and(
					operators.eq(fields.organizationId, checkRoleResult.id),
					operators.eq(fields.memberId, checkExistProfile.id)
				),
		});

		if (checkExistingMember) {
			throw new Error("Member already exists in this organization");
		}

		await db
			.insert(organizationMember)
			.values({
				id: generatePrimaryKey("organizationMember"),
				organizationId: checkRoleResult.id,
				memberId: checkExistProfile.id,
				role: data.member.role,
			})
			.returning({
				id: organizationMember.id,
			});

		return {
			message: "Member added successfully",
		};
	});
