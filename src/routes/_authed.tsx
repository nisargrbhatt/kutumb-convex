import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
	beforeLoad: ({ context, location }) => {
		if (!context?.session) {
			throw redirect({ to: "/login" });
		}

		if (
			!context?.session?.session?.activeOrganizationId &&
			!location?.pathname?.startsWith("/onboarding")
		) {
			throw redirect({ to: "/onboarding/create" });
		}
	},
});
