import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/_community/dashboard")({
	beforeLoad: (ctx) => {
		console.log("activeOrganizationId", ctx.context.session?.session?.activeOrganizationId);
		return { activeOrganizationId: ctx.context.session?.session?.activeOrganizationId };
	},
	loader: ({ context }) => context.activeOrganizationId,
	component: RouteComponent,
});

function RouteComponent() {
	const activeOrgId = Route.useLoaderData();
	return <div>Hello "/_authed/community/$slug/_community/dashboard"! {activeOrgId}</div>;
}
