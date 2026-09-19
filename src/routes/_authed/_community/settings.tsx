import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/_community/settings")({
	beforeLoad: ({ context }) => {
		if (context.member?.role !== "owner") {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: () => <Outlet />,
});
