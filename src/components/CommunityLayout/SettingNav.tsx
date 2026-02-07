import { Link, useRouteContext } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "../ui/sidebar";
import { LayoutDashboard } from "lucide-react";

interface Props {
	slug: string;
}

export function SettingNav({ slug }: Props) {
	const membershipRole = useRouteContext({
		from: "/_authed/community/$slug/_community",
		select: (search) => search.organization?.membership?.role,
	});

	if (membershipRole === "member") {
		return null;
	}

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Settings</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/settings/overview"}
							params={{
								slug,
							}}
						>
							<LayoutDashboard />
							<span>Overview</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/settings/fields"}
							params={{
								slug,
							}}
						>
							<LayoutDashboard />
							<span>Fields</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton asChild>
						<Link
							to={"/community/$slug/settings/members"}
							params={{
								slug,
							}}
						>
							<LayoutDashboard />
							<span>Members</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
