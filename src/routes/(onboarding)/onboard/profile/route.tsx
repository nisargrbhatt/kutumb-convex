import { db } from "@/db";
import { profile } from "@/db/schema";
import { authMiddleware } from "@/middleware/auth";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { authClient } from "@/lib/auth-client";
import { CreateProfileForm } from "./-components/CreateProfileForm";

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
			throw redirect({
				to: "/onboard/organization",
				search: (prev) => ({
					redirectTo: prev?.redirectTo,
				}),
			});
		}

		return { userId: userId };
	});

export const Route = createFileRoute("/(onboarding)/onboard/profile")({
	beforeLoad: async () => {
		const result = await checkProfileExists();
		return result;
	},
	validateSearch: z.object({
		redirectTo: z.string().trim().optional(),
	}),
	component: RouteComponent,
});

function RouteComponent() {
	const { data } = authClient.useSession();
	const navigate = Route.useNavigate();

	const handleSuccess = () => {
		navigate({
			to: "/onboard/organization",
			search: (prev) => ({
				redirectTo: prev?.redirectTo,
			}),
		});
	};

	return (
		<div className="flex h-full w-full flex-col items-center justify-center">
			{data?.user?.email ? (
				<CreateProfileForm defaultEmail={data?.user?.email} handleSuccess={handleSuccess} />
			) : null}
		</div>
	);
}
