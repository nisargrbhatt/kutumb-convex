import { Link } from "@tanstack/react-router";
import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "../ui/sidebar";
import { useActor } from "@/hooks/useActor";
import { IconAffiliate, IconInputSearch, IconRobot, IconUser } from "@tabler/icons-react";

export function SettingNav() {
	const { toggleSidebar, isMobile, open } = useSidebar();
	const actor = useActor();

	if (actor?.role !== "owner") {
		return null;
	}

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Settings</SidebarGroupLabel>
			<SidebarMenu>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton
						render={
							<Link
								to={"/settings/overview"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconAffiliate />
						<span>Overview</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton
						render={
							<Link
								to={"/settings/fields"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconInputSearch />
						<span>Fields</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton
						render={
							<Link
								to={"/settings/members"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconUser />
						<span>Members</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem
					onClick={() => {
						if (open && isMobile) {
							toggleSidebar();
						}
					}}
				>
					<SidebarMenuButton
						render={
							<Link
								to={"/settings/ai"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconRobot />
						<span>AI</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
