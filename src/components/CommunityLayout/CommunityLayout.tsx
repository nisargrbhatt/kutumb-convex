import type { ReactNode } from "react";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import { TrialBanner } from "./TrialBanner";
import type { ResolvedOrgStatus } from "@/lib/org-status";

interface Props {
	children: ReactNode;
	orgStatus: ResolvedOrgStatus;
}

export function CommunityLayout({ children, orgStatus }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar />
			<main className="w-full">
				<TrialBanner orgStatus={orgStatus} />
				{children}
			</main>
		</SidebarProvider>
	);
}
