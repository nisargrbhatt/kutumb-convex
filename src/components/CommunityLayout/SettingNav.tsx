import { Link, useRouteContext } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "../ui/sidebar";
import { LayoutDashboard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOrganizationContextQuery } from "@/api/organization";

interface Props {
	slug: string;
}

export function SettingNav({ slug }: Props) {
	const { data } = useQuery(
		getOrganizationContextQuery({
			slug,
		})
	);
	const membershipRole = data?.org?.membership?.role;

	if (membershipRole !== "owner") {
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
