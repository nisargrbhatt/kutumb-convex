import type { ReactNode } from "react";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { VerifyEmailNag } from "./VerifyEmailNag";

interface Props {
	children: ReactNode;
}

export function CommunityLayout({ children }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<main className="w-full">
				<VerifyEmailNag />
				{children}
			</main>
		</SidebarProvider>
	);
}
