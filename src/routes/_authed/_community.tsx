import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { ONBOARDING_CREATE_PATH } from "@/domain/authRoutes";
import { LOCKED_PATH } from "@/domain/lock";
import { activeOrgBillingQuery } from "@/queries/billingAccess";

export const Route = createFileRoute("/_authed/_community")({
	// `_authed` already redirects org-less sessions; this narrows the type for child loaders.
	// Locked org → `/locked` (spec: Lock enforcement > Route gate).
	beforeLoad: async ({ context }) => {
		const organizationId = context.session?.session.activeOrganizationId;
		if (typeof organizationId !== "string") throw redirect({ to: ONBOARDING_CREATE_PATH });
		const billing = await context.queryClient.fetchQuery(activeOrgBillingQuery(organizationId));
		if (billing.access.locked) throw redirect({ to: LOCKED_PATH });
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
