import { RootLayout } from "@/components/RootLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
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

		return organizations;
	});

export const Route = createFileRoute("/_authed/community/pick")({
	validateSearch: z.object({
		redirectTo: z.string().optional(),
	}),
	loader: async () => {
		const result = await fetchOrganizations();

		const firstOrg = result?.at(0);

		if (result.length === 1 && firstOrg) {
			throw redirect({
				to: `/community/$slug/dashboard`,
				params: {
					slug: firstOrg?.slug,
				},
			});
		}

		return { organizations: result };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { organizations } = Route.useLoaderData();

	return (
		<RootLayout>
			<div className="flex h-full w-full items-center justify-center">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle>Select a Community</CardTitle>
						<CardDescription>Select a community to join</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex w-full flex-col items-start justify-start gap-2">
							{organizations?.map((org) => (
								<Item variant="outline" key={org.slug} className="w-full">
									<ItemContent>
										<ItemTitle>{org.name}</ItemTitle>
										<ItemDescription>{org.slug}</ItemDescription>
									</ItemContent>
									<ItemActions>
										<Route.Link
											to={"/community/$slug/dashboard"}
											params={{
												slug: org.slug,
											}}
										>
											<Button variant="outline" size="sm">
												Open
											</Button>
										</Route.Link>
									</ItemActions>
								</Item>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</RootLayout>
	);
}
