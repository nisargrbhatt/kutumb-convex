import { createFileRoute, redirect } from "@tanstack/react-router";
import { LOGIN_PATH, ONBOARDING_CREATE_PATH, isOnboardingPath } from "@/domain/authRoutes";

export const Route = createFileRoute("/_authed")({
	beforeLoad: ({ context, location }) => {
		if (!context?.session) {
			throw redirect({ to: LOGIN_PATH, search: { redirectTo: location.href } });
		}

		if (!context.session.session.activeOrganizationId && !isOnboardingPath(location.pathname)) {
			throw redirect({ to: ONBOARDING_CREATE_PATH });
		}

		return { userId: context.session.user.id };
	},
});
