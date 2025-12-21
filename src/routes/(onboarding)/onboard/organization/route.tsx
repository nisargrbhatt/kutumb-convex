import { db } from "@/db";
import { organizationMember, profile } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

const checkOrganizationExists = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const userId = context.userId;

		const profileResult = await db.query.profile.findFirst({
			where: eq(profile.userId, userId),
			columns: {
				id: true,
			},
		});

		if (!profileResult?.id) {
			throw redirect({ to: "/onboard/profile" });
		}

		const organizationMemberResult = await db.query.organizationMember.findFirst({
			where: eq(organizationMember.memberId, profileResult.id),
			columns: {
				id: true,
			},
		});

		if (organizationMemberResult?.id) {
			throw redirect({ to: "/community/pick" });
		}
	});

export const Route = createFileRoute("/(onboarding)/onboard/organization")({
	beforeLoad: async () => {
		await checkOrganizationExists();
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Organization Create Page</div>;
}
