import { Link } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "../ui/sidebar";
import { LayoutDashboard } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function SettingNav() {
	const { data: activeMemberRole } = authClient.useActiveMemberRole();

	if (activeMemberRole?.role !== "owner") {
		return null;
	}

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Settings</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link to={"/settings/overview"}>
							<LayoutDashboard />
							<span>Overview</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link to={"/settings/fields"}>
							<LayoutDashboard />
							<span>Fields</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link to={"/settings/members"}>
							<LayoutDashboard />
							<span>Members</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
