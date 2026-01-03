import { LayoutList, LayoutDashboard } from "lucide-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";

interface Props {
	slug: string;
}

export function CommunityNav({ slug }: Props) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>Community</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/dashboard"}
							params={{
								slug,
							}}
						>
							<LayoutDashboard />
							<span>Dashboard</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/members"}
							params={{
								slug,
							}}
						>
							<LayoutList />
							<span>Members</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/community-tree"}
							params={{
								slug,
							}}
						>
							<LayoutList />
							<span>Community Tree</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/memories"}
							params={{
								slug,
							}}
						>
							<LayoutList />
							<span>Memories</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
