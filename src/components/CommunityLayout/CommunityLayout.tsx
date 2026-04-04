import type { ReactNode } from "react";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";

interface Props {
	children: ReactNode;
}

export function CommunityLayout({ children }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<main className="w-full">{children}</main>
		</SidebarProvider>
	);
}
