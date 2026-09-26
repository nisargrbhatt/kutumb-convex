import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { ONBOARDING_CREATE_PATH } from "@/domain/authRoutes";

export const Route = createFileRoute("/_authed/_community")({
	// `_authed` already redirects org-less sessions; this narrows the type for child loaders.
	beforeLoad: ({ context }) => {
		const organizationId = context.session?.session.activeOrganizationId;
		if (typeof organizationId !== "string") throw redirect({ to: ONBOARDING_CREATE_PATH });
		return { organizationId };
	},
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	return (
		<CommunityLayout>
			<Outlet />
		</CommunityLayout>
	);
}
