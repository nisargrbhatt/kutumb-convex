import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/community/pick")({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Pick a Community</div>;
}
