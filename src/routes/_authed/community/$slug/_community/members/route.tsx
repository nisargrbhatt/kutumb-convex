import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/community/$slug/_community/members")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/_authed/community/$slug/_community/members"!</div>;
}
