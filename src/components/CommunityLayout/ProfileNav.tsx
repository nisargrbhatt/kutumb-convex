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

export function ProfileNav({ slug }: Props) {
	return (
		<SidebarGroup>
			<SidebarGroupLabel>Profile</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/profile/info"}
							params={{
								slug,
							}}
						>
							<LayoutDashboard />
							<span>Info</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/profile/addresses"}
							params={{
								slug,
							}}
						>
							<LayoutList />
							<span>Addresses</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/profile/relationships"}
							params={{
								slug,
							}}
						>
							<LayoutList />
							<span>Relationships</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
