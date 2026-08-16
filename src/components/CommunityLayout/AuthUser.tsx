import { CreditCard, ChevronsUpDown, LogOut } from "lucide-react";
import { usePostHog } from "@posthog/react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { openBillingPortal } from "@/lib/billing-portal-client";

export function AuthUser() {
	const posthog = usePostHog();
	const { data: session } = authClient.useSession();
	const { data: currentRole } = authClient.useActiveMemberRole();
	const { isMobile } = useSidebar();

	const handleManageBilling = async () => {
		posthog.capture("billing_portal_opened", { source: "auth_user" });
		const { error } = await openBillingPortal(window.location.pathname);
		if (error) {
			toast.error("Failed to open billing portal", { description: "Please try again later." });
		}
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
							/>
						}
					>
						<Avatar className="h-8 w-8 rounded-lg">
							<AvatarImage src={session?.user?.image ?? undefined} />
							<AvatarFallback className="rounded-lg">
								{(session?.user?.name ?? session?.user?.email)?.at(0)?.toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<div className="grid flex-1 text-left text-sm leading-tight">
							<span className="truncate font-medium">
								{session?.user?.name ?? session?.user?.email}
							</span>
							<span className="truncate text-xs capitalize">{currentRole?.role}</span>
						</div>
						<ChevronsUpDown className="ml-auto size-4" />
					</DropdownMenuTrigger>
					<DropdownMenuContent
						className="w-(--anchor-width) min-w-56 rounded-lg"
						side={isMobile ? "bottom" : "right"}
						align="end"
						sideOffset={4}
					>
						<DropdownMenuGroup>
							<DropdownMenuLabel className="p-0 font-normal">
								<div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage src={session?.user?.image ?? undefined} />
										<AvatarFallback className="rounded-lg">
											{(session?.user?.name ?? session?.user?.email)?.at(0)?.toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-medium">
											{session?.user?.name ?? session?.user?.email}
										</span>
										<span className="truncate text-xs">{session?.user?.email}</span>
									</div>
								</div>
							</DropdownMenuLabel>
							<DropdownMenuSeparator />

							{currentRole?.role === "owner" ? (
								<DropdownMenuItem onClick={handleManageBilling}>
									<CreditCard />
									Manage billing
								</DropdownMenuItem>
							) : null}

							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={async () => {
									await authClient.signOut();
									window.location.href = new URL("/login", window.location.origin).toString();
								}}
							>
								<LogOut />
								Log out
							</DropdownMenuItem>
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
