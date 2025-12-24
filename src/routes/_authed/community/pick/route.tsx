import { db } from "@/db";
import { authMiddleware } from "@/middleware/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq, inArray } from "drizzle-orm";

import * as z from "zod";

export const fetchOrganizations = createServerFn({
	method: "GET",
})
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const profile = await db.query.profile.findFirst({
			where: (fields) => eq(fields.userId, context.userId),
			columns: {
				id: true,
			},
		});

		if (!profile) {
			throw redirect({
				to: "/onboard/profile",
			});
		}

		const organizationMembers = await db.query.organizationMember.findMany({
			where: (fields) => eq(fields.memberId, profile.id),
			columns: {
				organizationId: true,
			},
		});

		if (!organizationMembers) {
			throw redirect({
				to: "/onboard/organization",
			});
		}

		const organizations = await db.query.organization.findMany({
			where: (fields) =>
				inArray(
					fields.id,
					organizationMembers.map((i) => i.organizationId)
				),
			columns: {
				name: true,
				slug: true,
			},
		});

		if (!organizations || organizations.length < 1) {
			throw redirect({
				to: "/onboard/organization",
			});
		}

		const firstOrg = organizations?.at(0);

		if (organizations.length === 1 && firstOrg) {
			throw redirect({
				// [TODO] Redirect to proper community page
				// @ts-ignore
				to: `/community/${firstOrg.slug}`,
			});
		}

		return organizations;
	});

export const Route = createFileRoute("/_authed/community/pick")({
	beforeLoad: async () => {
		const result = await fetchOrganizations();
		return result;
	},
	validateSearch: z.object({
		redirectTo: z.string().optional(),
	}),
	loader: async ({ context }) => ({ organizations: context }),
	component: RouteComponent,
});

function RouteComponent() {
	const { organizations } = Route.useLoaderData();
	console.log(organizations);
	return <div>Pick a Community </div>;
}
