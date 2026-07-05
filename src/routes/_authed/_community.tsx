import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { getOrgStatus } from "@/api/organization";
import { ORGANIZATION_STATUS } from "@/db/constants";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/_community")({
	beforeLoad: async () => {
		const orgStatus = await getOrgStatus();
		if (orgStatus.status === ORGANIZATION_STATUS.pending) {
			throw redirect({ to: "/payment-required" });
		}
		return { orgStatus };
	},
	loader: async ({ context }) => ({ orgStatus: context.orgStatus }),
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	const { orgStatus } = Route.useLoaderData();

	return (
		<CommunityLayout orgStatus={orgStatus}>
			<Outlet />
		</CommunityLayout>
	);
}
