import { useQuery } from "@tanstack/react-query";
import { History, Inbox, LayoutList, LayoutDashboard } from "lucide-react";
import { useCan } from "@/hooks/useCan";
import { unseenCountQuery } from "@/queries/changeRequest";
import { useOrgId } from "@/queries/mutation";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { Link } from "@tanstack/react-router";
import { IconBinaryTree, IconPhoto } from "@tabler/icons-react";

export function CommunityNav() {
	const { toggleSidebar, isMobile, open } = useSidebar();
	const canReadAudit = useCan({ auditEvent: ["read"] });
	const { data: unseen } = useQuery(unseenCountQuery(useOrgId()));

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
					<SidebarMenuButton
						render={
							<Link
								to={"/dashboard"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<LayoutDashboard />
						<span>Dashboard</span>
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
								to={"/members"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<LayoutList />
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
								to={"/community-tree"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconBinaryTree />
						<span>Community Tree</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem>
					<SidebarMenuButton
						render={
							<Link
								to={"/memories"}
								activeProps={{
									className: "bg-muted",
								}}
							/>
						}
					>
						<IconPhoto />
						<span>Memories</span>
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
						render={<Link to={"/my-requests"} activeProps={{ className: "bg-muted" }} />}
					>
						<Inbox />
						<span>My requests</span>
					</SidebarMenuButton>
					{unseen ? (
						<SidebarMenuBadge
							className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground"
							aria-label={`${unseen} new ${unseen === 1 ? "outcome" : "outcomes"}`}
						>
							{unseen > 99 ? "99+" : unseen}
						</SidebarMenuBadge>
					) : null}
				</SidebarMenuItem>
				{canReadAudit ? (
					<SidebarMenuItem
						onClick={() => {
							if (open && isMobile) {
								toggleSidebar();
							}
						}}
					>
						<SidebarMenuButton
							render={<Link to={"/audit-log"} activeProps={{ className: "bg-muted" }} />}
						>
							<History />
							<span>Audit log</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				) : null}
			</SidebarMenu>
		</SidebarGroup>
	);
}
