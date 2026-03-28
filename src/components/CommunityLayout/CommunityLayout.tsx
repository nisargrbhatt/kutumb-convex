import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { Outlet } from "@tanstack/react-router";

export function CommunityLayout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<main className="w-full">
				<Outlet />
			</main>
		</SidebarProvider>
	);
}
