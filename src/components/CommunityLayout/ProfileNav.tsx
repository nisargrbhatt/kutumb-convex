import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
import { IconAddressBook, IconClipboardList, IconConnection } from "@tabler/icons-react";

export function ProfileNav() {
	const { toggleSidebar, isMobile, open } = useSidebar();

	return (
		<SidebarGroup>
			<SidebarGroupLabel>Profile</SidebarGroupLabel>
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
							to={"/profile/info"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<IconClipboardList />
							<span>Info</span>
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
							to={"/profile/addresses"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<IconAddressBook />
							<span>Addresses</span>
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
							to={"/profile/relationships"}
							activeProps={{
								className: "bg-muted",
							}}
						>
							<IconConnection />
							<span>Relationships</span>
						</Link>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</SidebarGroup>
	);
}
