import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./Sidebar";
import type { getOrganizationContext } from "@/api/organization";
import { Outlet } from "@tanstack/react-router";

type OrgContext = Awaited<ReturnType<typeof getOrganizationContext>>;

interface Props {
	org: NonNullable<OrgContext["org"]>;
	allOrg: OrgContext["allOrg"];
	profile: OrgContext["profile"];
}

export function CommunityLayout({ ...orgContext }: Props) {
	return (
		<SidebarProvider>
			<AppSidebar {...orgContext} />
			<main className="w-full">
				<Outlet />
			</main>
		</SidebarProvider>
	);
}
