import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@/components/ui/sidebar";
import { CommunityPicker } from "./CommunityPicker";
import { AuthUser } from "./AuthUser";
import { CommunityNav } from "./CommunityNav";
import { ProfileNav } from "./ProfileNav";
import { SettingNav } from "./SettingNav";

export function AppSidebar() {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<CommunityPicker />
			</SidebarHeader>
			<SidebarContent>
				<CommunityNav />
				<ProfileNav />
				<SettingNav />
			</SidebarContent>
			<SidebarFooter>
				<AuthUser />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
