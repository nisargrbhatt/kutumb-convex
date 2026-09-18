import { CommunityLayout } from "@/components/CommunityLayout/CommunityLayout";
import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/_community")({
	component: CommunityLayoutComponent,
});

function CommunityLayoutComponent() {
	return (
		<CommunityLayout>
			<Outlet />
		</CommunityLayout>
	);
}
