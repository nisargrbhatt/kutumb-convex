import { createFileRoute, Outlet } from "@tanstack/react-router";
import { RootLayout } from "@/components/RootLayout";

export const Route = createFileRoute("/(public)")({
	component: PublicLayout,
});

function PublicLayout() {
	return (
		<RootLayout>
			<Outlet />
		</RootLayout>
	);
}
