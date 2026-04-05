import { LayoutList, LayoutDashboard } from "lucide-react";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
import { IconBinaryTree, IconPhoto } from "@tabler/icons-react";

export function CommunityNav() {
	const { toggleSidebar, isMobile, open } = useSidebar();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Community</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton asChild>
						<Link
							to={"/dashboard"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<LayoutDashboard />
							<span>Dashboard</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton asChild>
						<Link
							to={"/members"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<LayoutList />
							<span>Members</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton asChild>
						<Link
							to={"/community-tree"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<IconBinaryTree />
							<span>Community Tree</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/memories"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<IconPhoto />
							<span>Memories</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
