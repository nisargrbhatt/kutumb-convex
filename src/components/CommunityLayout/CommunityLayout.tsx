import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { Outlet } from "@tanstack/react-router";

interface Props {
	slug: string;
}

export function CommunityLayout({ slug }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar slug={slug} />
			<main className="w-full">
				<Outlet />
			</main>
		</SidebarProvider>
	);
}
