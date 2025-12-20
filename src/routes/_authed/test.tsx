import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/test")({
	component: RouteComponent,
	loader: async ({ context }) => ({ userId: context.userId }),
});

function RouteComponent() {
	const { userId } = Route.useLoaderData();
	return <div>Hello "/_authed/test"! {userId}</div>;
}
