import { db } from "@/db";
import { profile } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";

const checkProfileExists = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const userId = context.userId;

		const profileResult = await db.query.profile.findFirst({
			where: eq(profile.userId, userId),
			columns: {
				id: true,
			},
		});

		if (profileResult?.id) {
			throw redirect({ to: "/onboard/organization" });
		}

		return { userId: userId };
	});

export const Route = createFileRoute("/(onboarding)/onboard/profile")({
	beforeLoad: async () => {
		const result = await checkProfileExists();
		return result;
	},
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Profile onboard form </div>;
}
