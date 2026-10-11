import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, History, LayoutList, LayoutDashboard } from "lucide-react";
import { useCan } from "@/hooks/useCan";
import { pendingCountQuery } from "@/queries/changeRequest";
import { useActor } from "@/hooks/useActor";

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
	const canReview = useCan({ changeRequest: ["review"] });
	const orgId = useActor()?.organizationId ?? "";
	const { data: pendingCount = 0 } = useQuery({
		...pendingCountQuery(orgId),
		enabled: canReview,
	});

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
				{canReview ? (
					<SidebarMenuItem
						onClick={() => {
							if (open && isMobile) {
								toggleSidebar();
							}
						}}
					>
						<SidebarMenuButton
							render={<Link to={"/reviews"} activeProps={{ className: "bg-muted" }} />}
						>
							<ClipboardCheck />
							<span>Reviews</span>
						</SidebarMenuButton>
						{pendingCount > 0 ? (
							<SidebarMenuBadge
								className="bg-primary text-primary-foreground peer-hover/menu-button:text-primary-foreground peer-data-active/menu-button:text-primary-foreground"
								aria-label={`${pendingCount} pending`}
							>
								{pendingCount > 99 ? "99+" : pendingCount}
							</SidebarMenuBadge>
						) : null}
					</SidebarMenuItem>
				) : null}
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
