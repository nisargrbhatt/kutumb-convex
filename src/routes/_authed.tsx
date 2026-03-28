import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
	beforeLoad: ({ context }) => {
		if (!context?.session) {
			throw redirect({ to: "/login" });
		}
		if (!context?.session?.session?.activeOrganizationId) {
			throw redirect({ to: "/onboarding/create" });
		}
	},
});
